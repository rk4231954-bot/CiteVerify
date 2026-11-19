import JSZip from "jszip";
import mammoth from "mammoth";
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
  type RawBlock,
} from "../types/document.types.ts";

/**
 * DOCX extraction with Mammoth (document body → semantic HTML), walked with
 * Bun's built-in HTMLRewriter to recover paragraphs, headings (with levels),
 * list items, and tables in document order.
 *
 * DOCX files don't store page layout, so every pageNumber is null.
 */

const STYLE_MAP = [
  "p[style-name='Title'] => h1.doc-title:fresh",
  "p[style-name='Subtitle'] => p:fresh",
];

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const BLOCK_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, table, tr, td, th, br";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code =
        e[1]?.toLowerCase() === "x"
          ? Number.parseInt(e.slice(2), 16)
          : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Walks Mammoth's HTML and emits blocks in document order. */
async function htmlToBlocks(
  html: string,
): Promise<{ blocks: RawBlock[]; titleCandidate: string | null }> {
  const blocks: RawBlock[] = [];
  let titleCandidate: string | null = null;

  // Current text block (paragraph/heading/list item) outside tables.
  let block: { tag: string; text: string; isTitle: boolean } | null = null;
  // Table state: tables can nest; we flatten nested-table text into the outer cell.
  let tableDepth = 0;
  let rows: string[][] = [];
  let cell: string | null = null;

  const flushBlock = () => {
    if (!block) return;
    const text = block.text;
    if (HEADING_TAGS.has(block.tag)) {
      blocks.push({
        kind: "heading",
        text,
        level: Number(block.tag[1]),
        pageNumber: null,
        isTitle: block.isTitle,
      });
      if (block.isTitle && !titleCandidate && text.trim())
        titleCandidate = text;
    } else {
      blocks.push({ kind: "paragraph", text, pageNumber: null });
    }
    block = null;
  };

  const rewriter = new HTMLRewriter()
    .on(BLOCK_SELECTOR, {
      element(el) {
        const tag = el.tagName;
        if (tag === "br") {
          if (cell !== null) cell += "\n";
          else if (block) block.text += "\n";
          return;
        }
        if (tag === "table") {
          if (tableDepth === 0) {
            flushBlock();
            rows = [];
          }
          tableDepth++;
          el.onEndTag(() => {
            tableDepth--;
            if (tableDepth === 0)
              blocks.push({ kind: "table", rows, pageNumber: null });
          });
          return;
        }
        if (tableDepth > 0) {
          if (tableDepth > 1) return; // nested table: its text flows into the outer cell
          if (tag === "tr") rows.push([]);
          else if (tag === "td" || tag === "th") {
            cell = "";
            el.onEndTag(() => {
              rows.at(-1)?.push(cell ?? "");
              cell = null;
            });
          } else if (tag === "p" || tag === "li") {
            if (cell) cell += "\n"; // separate multiple paragraphs in one cell
          }
          return;
        }
        // Text block outside tables. A new block (e.g. a nested list item)
        // first flushes the text gathered so far, keeping document order.
        flushBlock();
        block = {
          tag,
          text: "",
          isTitle: (el.getAttribute("class") ?? "").includes("doc-title"),
        };
        el.onEndTag(() => {
          if (block?.tag === tag) flushBlock();
        });
      },
    })
    .onDocument({
      text(chunk) {
        if (!chunk.text) return;
        const text = decodeEntities(chunk.text);
        if (cell !== null) cell += text;
        else if (block) block.text += text;
        else if (text.trim())
          blocks.push({ kind: "paragraph", text, pageNumber: null }); // stray text
      },
    });

  await rewriter.transform(new Response(html)).text();
  flushBlock();
  return { blocks, titleCandidate };
}

function xmlTag(xml: string, tag: string): string | null {
  const match = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`),
  );
  return match?.[1] ? decodeEntities(match[1]) : null;
}

/** Reads core document properties (docProps/core.xml) — title, creator, dates. */
async function readCoreProperties(zip: JSZip): Promise<FileMetadata> {
  const metadata = emptyFileMetadata();
  const core = await zip.file("docProps/core.xml")?.async("string");
  if (!core) return metadata;
  const app = await zip.file("docProps/app.xml")?.async("string");
  return {
    ...metadata,
    title: metadataString(xmlTag(core, "dc:title")),
    authors: splitAuthors(metadataString(xmlTag(core, "dc:creator"))),
    subject:
      metadataString(xmlTag(core, "dc:subject")) ??
      metadataString(xmlTag(core, "dc:description")),
    keywords: metadataString(xmlTag(core, "cp:keywords")),
    language: metadataString(xmlTag(core, "dc:language")),
    creator: app ? metadataString(xmlTag(app, "Application")) : null,
    createdAt: metadataString(xmlTag(core, "dcterms:created")),
    modifiedAt: metadataString(xmlTag(core, "dcterms:modified")),
  };
}

export async function parseDocx(data: Uint8Array): Promise<ExtractionResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (error) {
    throw new DocumentParseError(
      "CORRUPTED_FILE",
      `The DOCX file is corrupted: ${(error as Error).message}`,
      { cause: error },
    );
  }
  if (!zip.file("word/document.xml")) {
    throw new DocumentParseError(
      "CORRUPTED_FILE",
      "Not a Word document: word/document.xml is missing",
    );
  }

  let html: string;
  const warnings: string[] = [];
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(data) },
      {
        styleMap: STYLE_MAP,
        // Skip image data entirely; only text is needed.
        convertImage: mammoth.images.imgElement(async () => ({ src: "" })),
      },
    );
    html = result.value;
    const messages = [...new Set(result.messages.map((m) => m.message))];
    warnings.push(...messages.slice(0, 10));
    if (messages.length > 10)
      warnings.push(`…and ${messages.length - 10} more conversion warnings.`);
  } catch (error) {
    throw new DocumentParseError(
      "PARSE_ERROR",
      `Could not read the DOCX file: ${(error as Error).message}`,
      { cause: error },
    );
  }

  const [{ blocks, titleCandidate }, metadata] = await Promise.all([
    htmlToBlocks(html),
    readCoreProperties(zip),
  ]);

  return assembleResult(
    {
      format: "docx",
      blocks,
      metadata,
      totalPages: null,
      pages: [],
      warnings,
      titleCandidate,
    },
    "docx",
  );
}
