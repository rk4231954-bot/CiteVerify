import { describe, expect, test } from "bun:test";
import { ExtractionStatus } from "@citeverify/shared";
import JSZip from "jszip";
import {
  DocumentParseError,
  detectFormat,
  parseDocument,
  parseDocumentFile,
} from "../src/index.ts";
import { buildDocx, buildPdf, flowPage } from "./fixtures.ts";

async function parseError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DocumentParseError);
    return error as DocumentParseError;
  }
  throw new Error("expected a DocumentParseError");
}

describe("unsupported formats", () => {
  test.each([
    ["plain text", new TextEncoder().encode("just some text")],
    [
      "PNG image",
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ],
    [
      "legacy .doc",
      new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]),
    ],
  ])("rejects %s", async (_label, bytes) => {
    expect((await parseError(parseDocument(bytes))).code).toBe(
      "UNSUPPORTED_FORMAT",
    );
  });

  test("rejects a ZIP that isn't a Word document", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "not a docx");
    const err = await parseError(
      parseDocument(await zip.generateAsync({ type: "uint8array" })),
    );
    expect(err.code).toBe("CORRUPTED_FILE");
  });

  test("rejects content that doesn't match the expected format", async () => {
    const pdf = buildPdf([flowPage([{ lines: ["text"] }])]);
    const err = await parseError(
      parseDocument(pdf, { expectedFormat: "docx" }),
    );
    expect(err.code).toBe("UNSUPPORTED_FORMAT");
  });

  test("detectFormat uses content, not file names", () => {
    expect(detectFormat(buildPdf([[]]))).toBe("pdf");
    expect(() => detectFormat(new Uint8Array())).toThrow(DocumentParseError);
  });
});

describe("corrupted files", () => {
  test("a PDF header followed by garbage", async () => {
    const err = await parseError(
      parseDocument(
        new TextEncoder().encode("%PDF-1.4\n<<garbage>> not a pdf"),
      ),
    );
    expect(err.code).toBe("CORRUPTED_FILE");
  });

  test("a truncated DOCX", async () => {
    const docx = await buildDocx([{ type: "paragraph", text: "hello" }]);
    const err = await parseError(parseDocument(docx.subarray(0, 40)));
    expect(err.code).toBe("CORRUPTED_FILE");
  });

  test("a missing file on disk", async () => {
    const err = await parseError(
      parseDocumentFile("/nonexistent/citeverify/file.pdf"),
    );
    expect(err.code).toBe("PARSE_ERROR");
  });
});

describe("empty documents", () => {
  test("a PDF with no text is EMPTY (e.g. scanned images; no OCR)", async () => {
    const r = await parseDocument(buildPdf([[], []]));
    expect(r.status).toBe(ExtractionStatus.EMPTY);
    expect(r.paragraphs).toEqual([]);
    expect(r.totalPages).toBe(2);
    expect(r.warnings.some((w) => w.includes("OCR is not supported"))).toBe(
      true,
    );
  });

  test("a DOCX with only blank paragraphs is EMPTY", async () => {
    const r = await parseDocument(
      await buildDocx([{ type: "paragraph", text: "   " }]),
    );
    expect(r.status).toBe(ExtractionStatus.EMPTY);
    expect(r.warnings).toContain("The document contains no text.");
  });
});

describe("missing metadata is reported as null — never invented", () => {
  test("PDF without Info fields or a large title", async () => {
    const r = await parseDocument(
      buildPdf([flowPage([{ lines: ["Body text with no title styling."] }])]),
    );
    expect(r).toMatchObject({
      title: null,
      titleSource: null,
      authors: [],
      abstract: null,
    });
    expect(r.metadata).toMatchObject({
      title: null,
      authors: [],
      subject: null,
      keywords: null,
      createdAt: null,
    });
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        "No document title found in metadata or content.",
        "No author information in the file metadata.",
      ]),
    );
  });

  test("DOCX without core properties", async () => {
    const r = await parseDocument(
      await buildDocx([{ type: "paragraph", text: "Just a paragraph." }], null),
    );
    expect(r).toMatchObject({
      title: null,
      authors: [],
      abstract: null,
      totalPages: null,
    });
    expect(r.metadata.createdAt).toBeNull();
  });

  test("placeholder embedded titles are ignored in favour of content", async () => {
    const pdf = buildPdf(
      [
        flowPage([
          { lines: ["Real Synthetic Title"], size: 20 },
          {
            lines: [
              "Body text that is longer than the title, as in any real paper.",
            ],
          },
        ]),
      ],
      {
        Title: "Microsoft Word - draft3.docx",
      },
    );
    const r = await parseDocument(pdf);
    expect(r).toMatchObject({
      title: "Real Synthetic Title",
      titleSource: "content",
    });
  });
});
