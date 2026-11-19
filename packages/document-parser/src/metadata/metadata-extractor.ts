import { ExtractionStatus } from "@citeverify/shared";
import {
  cleanMultilineText,
  cleanText,
  countWords,
  isEffectivelyEmpty,
} from "../text/text-cleaner.ts";
import type {
  ExtractionResult,
  FileMetadata,
  Heading,
  Paragraph,
  RawExtraction,
  Table,
} from "../types/document.types.ts";

/** Bump when the output format or extraction heuristics change meaningfully. */
export const EXTRACTOR_VERSION = "1.0.0";

/** Embedded titles that are tool defaults rather than a real title. */
const PLACEHOLDER_TITLE =
  /^(untitled|title|document\d*|microsoft word\s*-.*|.*\.(docx?|pdf|tex|dvi|rtf))$/i;

const ABSTRACT_HEADING = /^(?:\d+[.)]?\s*)?abstract[.:]?$/i;
const INLINE_ABSTRACT = /^abstract\s*[:.\-–—]\s*/i;

export function emptyFileMetadata(): FileMetadata {
  return {
    title: null,
    authors: [],
    subject: null,
    keywords: null,
    language: null,
    creator: null,
    producer: null,
    createdAt: null,
    modifiedAt: null,
  };
}

/** Trims a metadata string; returns null for empty values. Never fabricates. */
export function metadataString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = cleanText(value);
  return cleaned ? cleaned : null;
}

/** Splits an embedded author field ("Doe, J.; Roe, A." / "J. Doe and A. Roe") into names. */
export function splitAuthors(value: string | null): string[] {
  if (!value) return [];
  const separator = value.includes(";") ? /\s*;\s*/ : /\s*(?:\band\b|&)\s*/i;
  return value
    .split(separator)
    .map((a) => a.trim())
    .filter(Boolean);
}

function pickTitle(metadataTitle: string | null, candidate: string | null) {
  if (metadataTitle && !PLACEHOLDER_TITLE.test(metadataTitle)) {
    return { title: metadataTitle, titleSource: "metadata" as const };
  }
  const fromContent = candidate ? cleanText(candidate) : "";
  if (fromContent)
    return { title: fromContent, titleSource: "content" as const };
  return { title: null, titleSource: null };
}

/** Abstract = paragraphs under an "Abstract" heading, or a paragraph starting "Abstract:". */
function findAbstract(
  paragraphs: Paragraph[],
  headings: Heading[],
): string | null {
  const heading = headings.find((h) => ABSTRACT_HEADING.test(h.text.trim()));
  if (heading) {
    const nextHeading = headings.find((h) => h.order > heading.order);
    const body = paragraphs
      .filter(
        (p) =>
          p.order > heading.order &&
          (!nextHeading || p.order < nextHeading.order),
      )
      .map((p) => p.cleanedText);
    if (body.length) return body.join("\n\n");
  }
  for (const p of paragraphs) {
    if (INLINE_ABSTRACT.test(p.cleanedText)) {
      const rest = p.cleanedText.replace(INLINE_ABSTRACT, "").trim();
      if (rest) return rest;
    }
  }
  return null;
}

function decideStatus(
  raw: RawExtraction,
  paragraphs: Paragraph[],
  tables: Table[],
  headings: Heading[],
) {
  const hasContent =
    paragraphs.length > 0 || tables.length > 0 || headings.length > 0;
  if (!hasContent) return ExtractionStatus.EMPTY;
  if (raw.pages.some((p) => !p.hasText)) return ExtractionStatus.PARTIAL;
  return ExtractionStatus.COMPLETED;
}

/** Turns raw format-specific blocks into the final, cleaned extraction result. */
export function assembleResult(
  raw: RawExtraction,
  parserName: string,
): ExtractionResult {
  const warnings = [...raw.warnings];
  const paragraphs: Paragraph[] = [];
  const headings: Heading[] = [];
  const tables: Table[] = [];
  let section: string | null = null;
  let order = 0;

  for (const block of raw.blocks) {
    if (block.kind === "heading") {
      const text = cleanText(block.text);
      if (isEffectivelyEmpty(text)) continue;
      headings.push({
        id: `h${headings.length + 1}`,
        order: order++,
        text,
        level: block.level,
        pageNumber: block.pageNumber,
      });
      if (!block.isTitle) section = text;
    } else if (block.kind === "paragraph") {
      const cleanedText = cleanText(block.text);
      if (isEffectivelyEmpty(cleanedText)) continue; // drop empty / punctuation-only paragraphs
      paragraphs.push({
        id: `p${paragraphs.length + 1}`,
        order: order++,
        originalText: block.text,
        cleanedText,
        pageNumber: block.pageNumber,
        section,
      });
    } else {
      const rows = block.rows
        .map((r) => r.map(cleanText))
        .filter((r) => r.some((c) => c));
      if (!rows.length) continue;
      tables.push({
        id: `t${tables.length + 1}`,
        order: order++,
        rows,
        pageNumber: block.pageNumber,
        section,
      });
    }
  }

  const status = decideStatus(raw, paragraphs, tables, headings);
  if (status === ExtractionStatus.EMPTY) {
    warnings.push(
      raw.format === "pdf"
        ? "No extractable text found. The PDF may contain only scanned images; OCR is not supported."
        : "The document contains no text.",
    );
  }

  const { title, titleSource } = pickTitle(
    raw.metadata.title,
    raw.titleCandidate,
  );
  if (!title) warnings.push("No document title found in metadata or content.");
  if (!raw.metadata.authors.length)
    warnings.push("No author information in the file metadata.");

  const abstract = findAbstract(paragraphs, headings);
  const allText = [
    ...paragraphs.map((p) => p.cleanedText),
    ...tables.flatMap((t) => t.rows.flat()),
  ].join(" ");

  return {
    format: raw.format,
    status,
    title,
    titleSource,
    authors: raw.metadata.authors,
    abstract: abstract ? cleanMultilineText(abstract) : null,
    totalPages: raw.totalPages,
    pages: raw.pages,
    paragraphs,
    headings,
    tables,
    metadata: raw.metadata,
    warnings,
    stats: {
      paragraphCount: paragraphs.length,
      wordCount: countWords(allText),
      characterCount: paragraphs.reduce((n, p) => n + p.cleanedText.length, 0),
    },
    extractedAt: new Date().toISOString(),
    parser: { name: parserName, version: EXTRACTOR_VERSION },
  };
}
