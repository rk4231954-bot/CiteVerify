/**
 * Builders for SYNTHETIC test documents, generated in memory so no binary
 * fixtures live in the repo and nothing depends on external services.
 * The text they contain is invented and is not real research.
 */
import JSZip from "jszip";

// ─── PDF ───────────────────────────────────────────────────────────────────

export type PdfLine = { text: string; size?: number; x?: number; y: number };
export type PdfPage = PdfLine[];
export type PdfInfo = {
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
};

/** Latin-1 bytes for WinAnsiEncoding, with PDF string escaping. */
function pdfString(text: string): string {
  return `(${text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

/**
 * Minimal, valid PDF 1.4 with one standard Helvetica font (WinAnsi encoding,
 * so Latin-1 characters such as ± × ² µ é work). Each line is placed at an
 * absolute position, which is how real PDFs lay out text.
 */
export function buildPdf(pages: PdfPage[], info: PdfInfo = {}): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // object number = index + 1

  add("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  add("PAGES_PLACEHOLDER"); // 2
  add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ); // 3
  const infoEntries = Object.entries(info)
    .map(([k, v]) => `/${k} ${pdfString(v)}`)
    .join(" ");
  add(
    `<< ${infoEntries} /Producer ${pdfString("CiteVerify synthetic test fixture")} >>`,
  ); // 4

  const pageRefs: string[] = [];
  for (const page of pages) {
    const stream = page
      .map(
        (l) =>
          `BT /F1 ${l.size ?? 11} Tf 1 0 0 1 ${l.x ?? 72} ${l.y} Tm ${pdfString(l.text)} Tj ET`,
      )
      .join("\n");
    add(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    const contentRef = objects.length;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
    pageRefs.push(`${objects.length} 0 R`);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pages.length} >>`;

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

/** Lays out paragraphs top-down: lines 14pt apart, paragraphs separated by a blank line. */
export function flowPage(
  blocks: { lines: string[]; size?: number }[],
  top = 720,
): PdfPage {
  const page: PdfPage = [];
  let y = top;
  for (const block of blocks) {
    const size = block.size ?? 11;
    for (const text of block.lines) {
      page.push({ text, size, y });
      y -= Math.round(size * 1.3);
    }
    y -= Math.round(size * 1.2); // paragraph gap
  }
  return page;
}

// ─── DOCX ──────────────────────────────────────────────────────────────────

export type DocxBlock =
  | { type: "title"; text: string }
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "table"; rows: string[][] };

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const para = (text: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

const styleDef = (id: string, name: string) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/></w:style>`;

function blockXml(b: DocxBlock): string {
  if (b.type === "title") return para(b.text, "Title");
  if (b.type === "heading") return para(b.text, `Heading${b.level}`);
  if (b.type === "paragraph") return para(b.text);
  const rows = b.rows.map(
    (r) => `<w:tr>${r.map((c) => `<w:tc>${para(c)}</w:tc>`).join("")}</w:tr>`,
  );
  return `<w:tbl>${rows.join("")}</w:tbl>`;
}

/** Minimal valid DOCX (WordprocessingML in a ZIP). */
export async function buildDocx(
  blocks: DocxBlock[],
  core: {
    title?: string;
    creator?: string;
    subject?: string;
    keywords?: string;
  } | null = {},
): Promise<Uint8Array> {
  const body = blocks.map(blockXml).join("");

  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
${core ? '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' : ""}
</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
${core ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' : ""}
</Relationships>`,
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  );
  zip.file(
    "word/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
${styleDef("Title", "Title")}${styleDef("Heading1", "heading 1")}${styleDef("Heading2", "heading 2")}${styleDef("Heading3", "heading 3")}
</w:styles>`,
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  if (core) {
    const tag = (name: string, value?: string) =>
      value ? `<${name}>${xmlEscape(value)}</${name}>` : "";
    zip.file(
      "docProps/core.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
${tag("dc:title", core.title)}${tag("dc:creator", core.creator)}${tag("dc:subject", core.subject)}${tag("cp:keywords", core.keywords)}
<dcterms:created xsi:type="dcterms:W3CDTF">2026-01-15T10:00:00Z</dcterms:created>
</cp:coreProperties>`,
    );
  }
  return zip.generateAsync({ type: "uint8array" });
}
