import { getDocument, PDFDateString } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import {
  assembleResult,
  emptyFileMetadata,
  metadataString,
  splitAuthors,
} from "../metadata/metadata-extractor.ts";
import {
  DocumentParseError,
  type ExtractionResult,
  type FileMetadata,
  type PageSummary,
  type RawBlock,
} from "../types/document.types.ts";

/**
 * PDF text extraction with pdfjs-dist.
 *
 * PDFs store positioned text runs, not paragraphs, so structure is
 * reconstructed heuristically: runs → lines (by baseline), lines → paragraphs
 * (by vertical gaps), headings (by numbering, known section names, or larger
 * font). The original visual layout is NOT fully preserved; multi-column and
 * complex layouts may produce imperfect paragraph boundaries.
 */

type Line = { text: string; y: number; x: number; size: number };
type TextRun = Pick<
  TextItem,
  "str" | "transform" | "width" | "height" | "hasEOL"
>;

const KNOWN_SECTIONS = new Set([
  "abstract",
  "introduction",
  "background",
  "related work",
  "methods",
  "method",
  "methodology",
  "materials and methods",
  "results",
  "results and discussion",
  "discussion",
  "conclusion",
  "conclusions",
  "limitations",
  "references",
  "bibliography",
  "acknowledgements",
  "acknowledgments",
  "appendix",
  "supplementary material",
  "data availability",
]);
const NUMBERED_HEADING = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\p{Lu}.*)$/u;
const PAGE_NUMBER_LINE = /^(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?$/i;

/** Value at fraction `p` (0..1) of the sorted list; 0 for an empty list. */
const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) * p)] ?? 0;
};

/** Groups positioned text runs into visual lines, inserting spaces at gaps. */
function runsToLines(runs: TextRun[]): Line[] {
  const lines: Line[] = [];
  let current: (Line & { endX: number; closed: boolean }) | null = null;

  for (const run of runs) {
    const [a = 0, b = 0, , , x = 0, y = 0] = run.transform;
    const size = Math.hypot(a, b) || run.height || 10;
    const sameLine =
      current && !current.closed && Math.abs(current.y - y) <= size * 0.5;

    if (run.str) {
      if (current && sameLine) {
        const gap = x - current.endX;
        const needsSpace =
          gap > size * 0.15 &&
          !/\s$/.test(current.text) &&
          !/^\s/.test(run.str);
        current.text += (needsSpace ? " " : "") + run.str;
        current.endX = x + run.width;
        current.size = Math.max(current.size, size);
      } else {
        if (current) lines.push(current);
        current = {
          text: run.str,
          y,
          x,
          size,
          endX: x + run.width,
          closed: false,
        };
      }
    }
    if (run.hasEOL && current) current.closed = true;
  }
  if (current) lines.push(current);
  return lines
    .map(({ text, y, x, size }) => ({
      text: text.replace(/\s+$/, ""),
      y,
      x,
      size,
    }))
    .filter((l) => l.text.trim());
}

/** Drops bare page-number lines at the top or bottom of a page (layout artifacts). */
function dropPageNumberLines(lines: Line[]): Line[] {
  if (lines.length < 2) return lines;
  const ys = lines.map((l) => l.y);
  const top = Math.max(...ys);
  const bottom = Math.min(...ys);
  return lines.filter(
    (l) =>
      !(
        PAGE_NUMBER_LINE.test(l.text.trim()) &&
        (l.y === top || l.y === bottom)
      ),
  );
}

function headingInfo(
  line: Line,
  bodySize: number,
): { level: number | null } | null {
  const text = line.text.trim();
  if (text.length > 120 || text.split(/\s+/).length > 14) return null;
  if (/[.,;:]$/.test(text) && !/^\d+\.$/.test(text)) return null;

  const numbered = text.match(NUMBERED_HEADING);
  const bareName = (numbered?.[2] ?? text).toLowerCase().replace(/[.:]$/, "");
  const larger = bodySize > 0 && line.size >= bodySize * 1.15;

  if (
    numbered &&
    (larger || KNOWN_SECTIONS.has(bareName) || text.length <= 60)
  ) {
    // Numbered headings must not look like a sentence ("2 patients were…").
    if (
      /^\p{Lu}/u.test(numbered[2] ?? "") &&
      !/\d{3,}/.test(numbered[1] ?? "")
    ) {
      return { level: (numbered[1] ?? "").split(".").length };
    }
  }
  if (KNOWN_SECTIONS.has(bareName)) return { level: null };
  if (larger && /\p{L}/u.test(text)) return { level: null };
  return null;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const date = PDFDateString.toDateObject(value);
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

type PdfMeta = {
  info?: Record<string, unknown>;
  metadata?: { get(name: string): unknown } | null;
};

function readMetadata(meta: PdfMeta): FileMetadata {
  const info = meta.info ?? {};
  const xmp = (name: string) => {
    const v = meta.metadata?.get(name);
    return Array.isArray(v) ? v.join("; ") : v;
  };
  const authors =
    metadataString(info.Author) ?? metadataString(xmp("dc:creator"));
  return {
    ...emptyFileMetadata(),
    title: metadataString(info.Title) ?? metadataString(xmp("dc:title")),
    authors: splitAuthors(authors),
    subject:
      metadataString(info.Subject) ?? metadataString(xmp("dc:description")),
    keywords: metadataString(info.Keywords),
    language: metadataString(info.Language),
    creator: metadataString(info.Creator),
    producer: metadataString(info.Producer),
    createdAt: toIsoDate(info.CreationDate),
    modifiedAt: toIsoDate(info.ModDate),
  };
}

function classifyLoadError(error: unknown): DocumentParseError {
  const name = (error as { name?: string })?.name ?? "";
  const message = (error as Error)?.message ?? String(error);
  if (name === "PasswordException") {
    return new DocumentParseError(
      "ENCRYPTED_FILE",
      "The PDF is password-protected",
      { cause: error },
    );
  }
  if (
    name === "InvalidPDFException" ||
    name === "FormatError" ||
    name === "MissingPDFException"
  ) {
    return new DocumentParseError(
      "CORRUPTED_FILE",
      `The PDF is corrupted or invalid: ${message}`,
      { cause: error },
    );
  }
  return new DocumentParseError(
    "PARSE_ERROR",
    `Could not read the PDF: ${message}`,
    { cause: error },
  );
}

export async function parsePdf(data: Uint8Array): Promise<ExtractionResult> {
  const task = getDocument({
    data: new Uint8Array(data), // pdfjs may detach the buffer it's given; never hand it the caller's
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
  });
  let pdf: Awaited<typeof task.promise>;
  try {
    pdf = await task.promise;
  } catch (error) {
    await task.destroy();
    throw classifyLoadError(error);
  }

  try {
    const warnings: string[] = [];
    let metadata = emptyFileMetadata();
    try {
      metadata = readMetadata((await pdf.getMetadata()) as PdfMeta);
    } catch {
      warnings.push("PDF metadata could not be read.");
    }

    // Pass 1: lines for every page.
    const pageLines: Line[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      try {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        const runs = content.items.filter((i): i is TextItem => "str" in i);
        pageLines.push(dropPageNumberLines(runsToLines(runs)));
        page.cleanup();
      } catch (error) {
        warnings.push(
          `Page ${n} could not be read: ${(error as Error).message}`,
        );
        pageLines.push([]);
      }
    }

    // Body font size = most common size, weighted by characters.
    const sizeWeights = new Map<number, number>();
    for (const l of pageLines.flat()) {
      const s = Math.round(l.size * 2) / 2;
      sizeWeights.set(s, (sizeWeights.get(s) ?? 0) + l.text.length);
    }
    const bodySize =
      [...sizeWeights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

    // Title candidate: the largest text in the top half of page 1, if clearly larger than body text.
    let titleCandidate: string | null = null;
    const first = pageLines[0] ?? [];
    if (first.length) {
      const topY = Math.max(...first.map((l) => l.y));
      const maxSize = Math.max(...first.map((l) => l.size));
      if (bodySize && maxSize >= bodySize * 1.3) {
        const titleLines = first.filter(
          (l) => Math.abs(l.size - maxSize) < 0.5 && topY - l.y < 400,
        );
        titleCandidate = titleLines.map((l) => l.text).join("\n") || null;
      }
    }

    // Pass 2: paragraphs and headings.
    const blocks: RawBlock[] = [];
    const pages: PageSummary[] = [];
    pageLines.forEach((lines, index) => {
      const pageNumber = index + 1;
      // Typical line spacing: lower quartile of gaps between same-size lines, so
      // paragraph and heading gaps (which are larger) don't inflate it.
      const gaps = lines
        .slice(1)
        .map((l, i) => ({ l, prev: lines[i] }))
        .filter(({ l, prev }) => prev && Math.abs(prev.size - l.size) < 0.5)
        .map(({ l, prev }) => (prev?.y ?? 0) - l.y)
        .filter((d) => d > 0 && d < 40);
      const lineSpacing = percentile(gaps, 0.25) || bodySize * 1.25;

      let paragraph: Line[] = [];
      let paragraphCount = 0;
      let characterCount = 0;
      const flush = () => {
        if (!paragraph.length) return;
        blocks.push({
          kind: "paragraph",
          text: paragraph.map((l) => l.text).join("\n"),
          pageNumber,
        });
        paragraphCount++;
        paragraph = [];
      };

      lines.forEach((line, i) => {
        characterCount += line.text.length;
        const prev = lines[i - 1];
        const isTitleLine =
          pageNumber === 1 &&
          titleCandidate !== null &&
          titleCandidate.split("\n").includes(line.text);
        const heading = isTitleLine ? null : headingInfo(line, bodySize);

        if (isTitleLine) {
          flush();
          const last = blocks.at(-1);
          if (last?.kind === "heading" && last.isTitle)
            last.text += `\n${line.text}`;
          else
            blocks.push({
              kind: "heading",
              text: line.text,
              level: 1,
              pageNumber,
              isTitle: true,
            });
          return;
        }
        if (heading) {
          flush();
          blocks.push({
            kind: "heading",
            text: line.text,
            level: heading.level,
            pageNumber,
          });
          return;
        }

        const dy = prev ? prev.y - line.y : 0;
        const newParagraph =
          !prev ||
          dy > lineSpacing * 1.4 || // blank-line gap
          dy < -1 || // jumped up: new column or text box
          Math.abs(line.size - prev.size) > Math.max(prev.size * 0.15, 0.5);
        if (newParagraph) flush();
        paragraph.push(line);
      });
      flush();

      const hasText = characterCount > 0;
      if (!hasText && pdf.numPages > 1)
        warnings.push(`Page ${pageNumber} has no extractable text.`);
      pages.push({ pageNumber, paragraphCount, characterCount, hasText });
    });

    return assembleResult(
      {
        format: "pdf",
        blocks,
        metadata,
        totalPages: pdf.numPages,
        pages,
        warnings,
        titleCandidate,
      },
      "pdf",
    );
  } finally {
    await task.destroy();
  }
}
