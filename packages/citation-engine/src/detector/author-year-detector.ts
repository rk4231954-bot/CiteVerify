/**
 * Author-year in-text citations.
 *
 * Parenthetical: (Smith, 2023) · (Smith et al., 2023) · (Smith & Johnson, 2022)
 *                (Smith, 2020a, b) · (Smith, 2020; Lee et al., 2021) · (see Smith, 2020, p. 4)
 * Narrative:     Smith et al. (2023) · Smith and Johnson (2022) · Smith (2020, 2021)
 *
 * Every item of a parenthetical must look like "Surname[s], year" — plain
 * years ("(2019)"), counts ("(n = 2020)") or figure/table references are not
 * citations. Surnames need a lowercase letter, so acronyms ("WHO") are skipped.
 */
import type {
  AuthorYearTarget,
  RawCitationMarker,
} from "../types/citation.types.ts";
import { isNonAuthorWord, SURNAME_SOURCE } from "../utils/names.ts";

const S = SURNAME_SOURCE;
const AUTHORS = `${S}(?:\\s+et\\s+al\\.?|(?:\\s*,\\s*${S})*\\s*,?\\s*(?:&|and)\\s+${S})?`;
const YEAR = `(?:1[6-9]\\d{2}|20\\d{2})[a-z]?|n\\.d\\.|in press|forthcoming`;
const YEARS = `(?:${YEAR})(?:\\s*,\\s*(?:(?:${YEAR})|[a-z](?![\\p{L}])))*`;
const LOCATOR = `(?:\\s*,\\s*(?:p|pp|ch|chap|sec|fig|table)\\.?\\s*[\\divxlc–-]+)?`;
const PREFIX = `(?:(?:[Ee]\\.g\\.|[Ii]\\.e\\.|[Ss]ee also|[Ss]ee|[Cc]f\\.|[Bb]ut see|[Rr]eviewed in|[Aa]dapted from|[Ff]or (?:a )?review,? see)[,\\s]+)?`;

const ITEM = new RegExp(
  `^${PREFIX}(${AUTHORS})(?:['’]s)?\\s*,?\\s+(${YEARS})${LOCATOR}$`,
  "u",
);
const PARENTHETICAL = /\(([^()]{4,400})\)/g;
const NARRATIVE = new RegExp(
  `(?<![\\p{L}\\-])(${AUTHORS})(?:['’]s)?\\s+\\((${YEARS})(${LOCATOR})\\)`,
  "gu",
);
const SURNAME = new RegExp(S, "gu");
const YEAR_TOKEN = /^(?:(\d{4})([a-z])?|n\.d\.|in press|forthcoming|([a-z]))$/;

/** Splits an author phrase into surnames and the "et al." flag. */
function parseAuthors(
  phrase: string,
): { authors: string[]; etAl: boolean } | null {
  const etAl = /\bet\s+al\.?/.test(phrase);
  const authors = (phrase.replace(/\bet\s+al\.?/, "").match(SURNAME) ?? []).map(
    (a) => a.trim(),
  );
  if (
    !authors.length ||
    authors.some((a) => isNonAuthorWord(a.split(/\s+/).pop() ?? a))
  )
    return null;
  return { authors, etAl };
}

/** "2020a, b, 2021" → [{2020,a},{2020,b},{2021,null}]; "n.d." → year null. */
function parseYears(
  text: string,
):
  | { year: number | null; yearSuffix: string | null; display: string }[]
  | null {
  const out: {
    year: number | null;
    yearSuffix: string | null;
    display: string;
  }[] = [];
  for (const raw of text.split(/\s*,\s*/)) {
    const m = raw.trim().match(YEAR_TOKEN);
    if (!m) return null;
    if (m[3]) {
      // A bare suffix letter continues the previous year: "2020a, b".
      const prev = out[out.length - 1];
      if (!prev?.year) return null;
      out.push({
        year: prev.year,
        yearSuffix: m[3],
        display: `${prev.year}${m[3]}`,
      });
    } else if (m[1]) {
      out.push({
        year: Number(m[1]),
        yearSuffix: m[2] ?? null,
        display: raw.trim(),
      });
    } else {
      out.push({ year: null, yearSuffix: null, display: raw.trim() });
    }
  }
  return out;
}

function displayAuthors(authors: string[], etAl: boolean): string {
  if (etAl) return `${authors[0]} et al.`;
  if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
  return authors.join(", ");
}

function toTargets(
  authorPhrase: string,
  yearsText: string,
  narrative: boolean,
) {
  const parsedAuthors = parseAuthors(authorPhrase);
  const years = parseYears(yearsText);
  if (!parsedAuthors || !years) return null;
  const name = displayAuthors(parsedAuthors.authors, parsedAuthors.etAl);
  return years.map((y) => ({
    key: `${name}, ${y.display}`,
    target: {
      kind: "AUTHOR_YEAR",
      authors: parsedAuthors.authors,
      etAl: parsedAuthors.etAl,
      year: y.year,
      yearSuffix: y.yearSuffix,
      narrative,
    } satisfies AuthorYearTarget,
  }));
}

export function detectAuthorYearCitations(text: string): RawCitationMarker[] {
  const markers: RawCitationMarker[] = [];

  for (const match of text.matchAll(PARENTHETICAL)) {
    const items = (match[1] ?? "").split(/\s*;\s*/).filter(Boolean);
    const targets: RawCitationMarker["targets"] = [];
    for (const item of items) {
      const m = item.trim().match(ITEM);
      const parsed = m ? toTargets(m[1] ?? "", m[2] ?? "", false) : null;
      if (parsed) targets.push(...parsed);
    }
    // Every part must be a citation unless at least one is and the rest is a short note ("unpublished data").
    const allValid =
      targets.length > 0 &&
      items.every((i) => ITEM.test(i.trim()) || i.split(/\s+/).length <= 3);
    if (!allValid) continue;
    markers.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      format: "AUTHOR_YEAR",
      targets,
    });
  }

  for (const match of text.matchAll(NARRATIVE)) {
    const start = match.index;
    const end = start + match[0].length;
    if (markers.some((m) => start < m.end && end > m.start)) continue;
    const targets = toTargets(match[1] ?? "", match[2] ?? "", true);
    if (targets)
      markers.push({
        text: match[0],
        start,
        end,
        format: "AUTHOR_YEAR",
        targets,
      });
  }

  return markers.sort((a, b) => a.start - b.start);
}
