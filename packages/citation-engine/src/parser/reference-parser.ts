/**
 * Bibliography extraction: finds the reference section, splits it into
 * entries and parses what each entry states.
 *
 * Fields that cannot be identified stay null/empty — nothing is guessed — and
 * the full raw text of every entry is always kept.
 *
 * Supported layouts:
 * - numbered:    "[1] …", "1. …", "1) …" (APA/Harvard/Vancouver/IEEE bodies)
 * - author-year: "Smith, J., & Lee, K. (2020). Title. Journal, 1(2), 3–4."
 */
import { cleanText } from "@citeverify/document-parser";
import { extractDois } from "../resolver/doi-resolver.ts";
import type {
  ParsedReference,
  SourceParagraph,
} from "../types/citation.types.ts";
import { isInitials, PARTICLES } from "../utils/names.ts";

const BIB_HEADING =
  /^(?:(?:\d{1,2}(?:\.\d{1,2})*|[IVXLC]+)\.?\s+)?(?:references?(?:\s+and\s+notes)?|bibliography|works\s+cited|literature\s+cited|cited\s+literature|reference\s+list)\s*:?$/i;

export const isBibliographyHeading = (text: string | null | undefined) =>
  !!text && BIB_HEADING.test(text.trim());

/** Bibliography line positions: whole paragraphs, or the lines after an undetected heading line. */
export type BibliographyLine = {
  text: string;
  paragraph: SourceParagraph;
  paragraphStart: boolean;
};

/**
 * Lines of the bibliography, in reading order. A paragraph belongs to it when
 * its section heading is a bibliography heading, or when an earlier paragraph
 * starts with such a heading line (headings the parser did not detect).
 */
export function findBibliography(paragraphs: readonly SourceParagraph[]): {
  lines: BibliographyLine[];
  paragraphIds: Set<string>;
} {
  const lines: BibliographyLine[] = [];
  const paragraphIds = new Set<string>();
  let inlineSection: string | null | undefined; // section in effect when an inline heading was seen

  for (const p of [...paragraphs].sort((a, b) => a.order - b.order)) {
    let rows = p.originalText.split("\n");
    const viaHeading = isBibliographyHeading(p.section);
    if (!viaHeading) {
      if (inlineSection !== undefined && p.section !== inlineSection)
        inlineSection = undefined; // a new section began
      if (inlineSection === undefined) {
        const headingRow = rows.findIndex((r) => isBibliographyHeading(r));
        if (headingRow === -1) continue;
        inlineSection = p.section;
        rows = rows.slice(headingRow + 1);
      }
    }
    paragraphIds.add(p.id);
    rows.forEach((text, i) => {
      if (text.trim())
        lines.push({ text, paragraph: p, paragraphStart: i === 0 });
    });
  }
  return { lines, paragraphIds };
}

// ─── Entry splitting ───────────────────────────────────────────────────────

const LABEL = /^\s*(?:\[(\d{1,3})\]|(\d{1,3})[.)])\s+(?=\S)/;
const INLINE_BRACKET_LABEL = /(?<=[.\s])\[(\d{1,3})\]\s+/g;
const PARTICLE = `(?:(?:${PARTICLES.join("|")})\\s+)*`;
/** Start of an author-year entry: "Smith, J." / "van der Berg, K." / "Smith JA," / "Smith, John". */
const AUTHOR_START = new RegExp(
  `^${PARTICLE}\\p{Lu}[\\p{L}'’\\-]+(?:\\s\\p{Lu}[\\p{L}'’\\-]+)?(?:,\\s*(?:\\p{Lu}\\.|\\p{Lu}\\p{Ll})|\\s\\p{Lu}{1,3}[,.])`,
  "u",
);
const HAS_YEAR = /\b(?:1[6-9]|20)\d{2}[a-z]?\b|n\.d\./;

type RawEntry = {
  lines: string[];
  label: string | null;
  paragraph: SourceParagraph;
};

const labelOf = (line: string) => {
  const m = line.match(LABEL);
  return m ? (m[1] ?? m[2] ?? null) : null;
};

function splitNumbered(lines: BibliographyLine[]): RawEntry[] {
  const entries: RawEntry[] = [];
  let expected = 0;
  for (const { text, paragraph } of lines) {
    // A merged line may hold several entries: "[3] … 2019. [4] …"
    const pieces: string[] = [];
    let last = 0;
    const leading = labelOf(text);
    let next = (leading ? Number(leading) : expected) + 1;
    for (const m of text.matchAll(INLINE_BRACKET_LABEL)) {
      if (m.index > 0 && Number(m[1]) === next) {
        pieces.push(text.slice(last, m.index));
        last = m.index;
        next++;
      }
    }
    pieces.push(text.slice(last));

    for (const piece of pieces) {
      const label = labelOf(piece);
      const current = entries[entries.length - 1];
      // Labels must continue the sequence, so a wrapped line starting "12. " is not a new entry.
      if (
        label &&
        (!current || Number(label) === expected + 1 || Number(label) === 1)
      ) {
        entries.push({ lines: [piece], label, paragraph });
        expected = Number(label);
      } else if (current) {
        current.lines.push(piece);
      } else {
        entries.push({ lines: [piece], label: null, paragraph });
      }
    }
  }
  return entries;
}

function splitAuthorYear(lines: BibliographyLine[]): RawEntry[] {
  const entries: RawEntry[] = [];
  for (const { text, paragraph, paragraphStart } of lines) {
    const current = entries[entries.length - 1];
    const body = current?.lines.join(" ") ?? "";
    const complete =
      HAS_YEAR.test(body) && /[.)\]]\s*$|\d\s*$/.test(body.trim());
    const continuation = /^\s*[\p{Ll}\d(&]/u.test(text); // "and …", "12(3), 4–5", "(2020)…"
    const startsNew =
      !current ||
      (paragraphStart && !continuation) ||
      (complete && AUTHOR_START.test(text.trim()));
    if (startsNew) entries.push({ lines: [text], label: null, paragraph });
    else current.lines.push(text);
  }
  return entries;
}

// ─── Field parsing ─────────────────────────────────────────────────────────

const PAREN_YEAR =
  /\(\s*((?:1[6-9]|20)\d{2})([a-z])?(?:,[^)]*)?\s*\)|\(\s*(n\.d\.)\s*\)/;
const BARE_YEAR = /(?<![\d./-])((?:1[6-9]|20)\d{2})([a-z])?(?![\d])/;
const URL = /https?:\/\/[^\s<>"]+/;
const QUOTED = /[“"]([^”"]{3,})[”"]/;

const tidy = (s: string) =>
  s
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:]+|[\s,;:]+$/g, "")
    .trim();

/** Splits an author segment into individual authors, keeping initials with their surname. */
export function splitAuthors(segment: string): {
  authors: string[];
  truncated: boolean;
} {
  const truncated = /\bet\s+al\b\.?|\.\.\./.test(segment);
  const cleaned = segment
    .replace(/,?\s*\bet\s+al\b\.?|\.\.\./g, "")
    .replace(/[\s,;]+$/, "");
  const pieces = cleaned.split(/\s*;\s*|\s*,?\s+(?:&|and)\s+/);
  const authors: string[] = [];
  for (const piece of pieces) {
    for (const token of piece.split(/\s*,\s*/)) {
      const t = token.trim();
      if (!t) continue;
      const prev = authors[authors.length - 1];
      // "Smith, J." splits into "Smith" + "J." — glue the initials back on.
      if (
        isInitials(t) &&
        prev &&
        !/,/.test(prev) &&
        !/\s\p{Lu}\.?$/u.test(prev)
      )
        authors[authors.length - 1] = `${prev}, ${t}`;
      else authors.push(t);
    }
  }
  const valid = authors.every(
    (a) => /\p{Lu}\p{Ll}/u.test(a) && a.split(/\s+/).length <= 6,
  );
  return valid ? { authors, truncated } : { authors: [], truncated };
}

/** End of the author list in "A. Smith, B. Lee. Title…" / "Smith J, Lee K. Title…" styles. */
function authorSegmentEnd(body: string): number {
  for (const m of body.matchAll(/\.\s+/g)) {
    const before = body.slice(0, m.index).match(/(\S+)$/)?.[1] ?? "";
    const after = body.slice(m.index + m[0].length);
    // A leading initial ("J. Smith") opens the entry or follows ",", "and", "&" or another
    // initial. After a surname ("Kim H. Title…") the period ends the author list instead.
    const ahead = body.slice(0, m.index - before.length).trimEnd();
    const leadingInitial =
      /^\p{Lu}$/u.test(before) &&
      (ahead === "" || /(?:,|\band|&|\b\p{Lu}\.)$/u.test(ahead));
    if (
      leadingInitial &&
      /^(?:\p{Lu}\.|\p{Lu}[\p{L}'’-]+[,.]|(?:&|and)\s)/u.test(after)
    )
      continue; // "J. Smith, …" / "J. A. Smith"
    if (leadingInitial && /^\p{Lu}[\p{L}'’-]+\s+(?:&|and)\s/u.test(after))
      continue; // "J. Smith and K. Lee"
    return m.index;
  }
  return -1;
}

function sentenceAfter(text: string): { sentence: string; rest: string } {
  const m = text.match(/^(.+?[^\s.]{2}[.?!])(?:\s+|$)/);
  if (!m) return { sentence: text, rest: "" };
  return { sentence: m[1] ?? "", rest: text.slice(m[0].length) };
}

/**
 * The journal/publisher right after the title. `periodEnds` is for Vancouver,
 * where the venue ends at ". "; elsewhere it ends at a comma, so abbreviated
 * names ("IEEE Trans. Fictional Eng.") stay whole.
 */
function venueFrom(rest: string, periodEnds: boolean): string | null {
  const text = rest.replace(/^[\s,.;:]+/, "").replace(/^In:?\s+/, "");
  if (
    !text ||
    /^(?:https?:|doi|vol\b|\d|retrieved|available|accessed|in press)/i.test(
      text,
    )
  )
    return null;
  const stop = periodEnds
    ? /[,;(]|\.\s|\s\d|\.$/
    : /[,;(]|\s\d|\.\s+(?=\d|https?:|doi)/i;
  const venue = tidy(text.split(stop)[0] ?? "").replace(/\.$/, "");
  if (
    !venue ||
    !/\p{L}{2}/u.test(venue) ||
    venue.length > 150 ||
    /\d/.test(venue)
  )
    return null;
  return venue;
}

function validTitle(title: string): string | null {
  const t = tidy(title).replace(/\.$/, "");
  if (t.split(/\s+/).length < 2 || /^(?:https?:|doi:?|10\.\d)/i.test(t))
    return null;
  return t;
}

export type ParsedFields = Pick<
  ParsedReference,
  | "authors"
  | "authorsTruncated"
  | "title"
  | "year"
  | "yearSuffix"
  | "venue"
  | "doi"
  | "url"
>;

/** Parses one entry (without its label). Unknown fields are null. */
export function parseReferenceFields(body: string): ParsedFields {
  const dois = extractDois(body);
  const urlMatch = body.match(URL)?.[0] ?? null;
  const url =
    urlMatch && !/doi\.org\//i.test(urlMatch)
      ? urlMatch.replace(/[.,;]+$/, "")
      : null;
  // Search for years/titles in the text with identifiers removed, so DOI digits don't count.
  const text = body
    .replace(/https?:\/\/\S+|\bdoi:\s*\S+|\b10\.\d{4,9}\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  let year: number | null = null;
  let yearSuffix: string | null = null;
  let authorSegment = "";
  let afterAuthors = "";
  let title: string | null = null;
  let venue: string | null = null;

  const paren = text.match(PAREN_YEAR);
  const quoted = text.match(QUOTED);
  if (paren && paren.index !== undefined) {
    // APA / Harvard: Authors (2020). Title. Venue, …
    year = paren[1] ? Number(paren[1]) : null;
    yearSuffix = paren[2] ?? null;
    authorSegment = text.slice(0, paren.index);
    afterAuthors = text.slice(paren.index + paren[0].length);
    const { sentence, rest } = sentenceAfter(
      afterAuthors.replace(/^[\s.,]+/, ""),
    );
    title = validTitle(sentence);
    venue = venueFrom(rest, false);
  } else if (quoted && quoted.index !== undefined) {
    // IEEE: A. Smith and B. Lee, "Title," Venue, vol. 1, 2020.
    authorSegment = text.slice(0, quoted.index);
    title = validTitle((quoted[1] ?? "").replace(/,$/, ""));
    venue = venueFrom(text.slice(quoted.index + quoted[0].length), false);
  } else {
    // Vancouver / plain: Smith J, Lee K. Title. Venue. 2020;1:2–3.
    const end = authorSegmentEnd(text);
    if (end > 0) {
      authorSegment = text.slice(0, end);
      const { sentence, rest } = sentenceAfter(text.slice(end + 1).trim());
      title = validTitle(sentence);
      venue = venueFrom(rest, true);
    }
  }
  if (year === null && !/\(\s*n\.d\.\s*\)/.test(text)) {
    const bare = text.match(BARE_YEAR);
    if (bare) {
      year = Number(bare[1]);
      yearSuffix = bare[2] ?? null;
    }
  }
  const { authors, truncated } = splitAuthors(authorSegment);
  return {
    authors,
    authorsTruncated: truncated,
    title,
    year,
    yearSuffix,
    venue,
    doi: dois[0] ?? null,
    url,
  };
}

export function referenceFingerprint(body: string): string {
  return body
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Rejoins identifiers that the layout broke across lines ("https://doi.org/" ⏎ "10.1/x"). */
function joinEntryLines(lines: string[]): string {
  const merged: string[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    if (
      prev !== undefined &&
      /(?:doi\.org\/|10\.\d{4,9}\/|\bdoi:)\s*$/i.test(prev)
    )
      merged[merged.length - 1] = prev.trimEnd() + line.trim();
    else merged.push(line);
  }
  return cleanText(merged.join("\n"));
}

export type ReferenceExtraction = {
  references: ParsedReference[];
  bibliographyParagraphIds: Set<string>;
  duplicatesRemoved: number;
  style: "NUMBERED" | "AUTHOR_YEAR" | null;
};

export function extractReferences(
  documentId: string,
  paragraphs: readonly SourceParagraph[],
): ReferenceExtraction {
  const { lines, paragraphIds } = findBibliography(paragraphs);
  if (!lines.length)
    return {
      references: [],
      bibliographyParagraphIds: paragraphIds,
      duplicatesRemoved: 0,
      style: null,
    };

  const labelled = lines.filter((l) => labelOf(l.text) !== null).length;
  const numbered = labelled >= 2 || (labelled === 1 && lines.length <= 2);
  const raw = numbered ? splitNumbered(lines) : splitAuthorYear(lines);

  const references: ParsedReference[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;
  for (const entry of raw) {
    const rawText = joinEntryLines(entry.lines);
    if (!rawText) continue;
    const body = rawText.replace(LABEL, "");
    const fingerprint = referenceFingerprint(body);
    if (!fingerprint || seen.has(fingerprint)) {
      duplicatesRemoved += fingerprint ? 1 : 0;
      continue;
    }
    seen.add(fingerprint);
    references.push({
      id: crypto.randomUUID(),
      documentId,
      rawText,
      label: entry.label,
      ...parseReferenceFields(body),
      paragraphId: entry.paragraph.id,
      pageNumber: entry.paragraph.pageNumber,
      position: references.length,
      fingerprint,
    });
  }
  return {
    references,
    bibliographyParagraphIds: paragraphIds,
    duplicatesRemoved,
    style: numbered ? "NUMBERED" : "AUTHOR_YEAR",
  };
}
