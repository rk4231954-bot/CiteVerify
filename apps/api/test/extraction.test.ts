import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { prisma } from "@citeverify/database";
import {
  buildDocx,
  buildPdf,
  flowPage,
} from "@citeverify/document-parser/testing";
import { env } from "../src/config/env.ts";
import {
  call,
  DOCX_MIME,
  fileForm,
  PDF_MIME,
  registerUser,
} from "./helpers.ts";

const samplePdf = () =>
  buildPdf(
    [
      flowPage([
        { lines: ["1. Introduction"], size: 13 },
        { lines: ["Synthetic claim text on page one [1]."] },
      ]),
      flowPage([{ lines: ["Synthetic result text on page two (p < 0.05)."] }]),
    ],
    { Title: "Synthetic API Test Paper", Author: "Example, A." },
  );

async function uploadFile(
  token: string,
  bytes: Uint8Array,
  name: string,
  mime: string,
) {
  const res = await call("POST", "/documents/upload", {
    token,
    form: fileForm(bytes, name, mime),
  });
  if (!res.body.success)
    throw new Error(`upload failed: ${JSON.stringify(res.body)}`);
  return res.body.data.id as string;
}

const newestUpload = () => {
  const files = readdirSync(env.UPLOAD_DIR).map((f) =>
    path.join(env.UPLOAD_DIR, f),
  );
  return (
    files.sort(
      (a, b) => Bun.file(b).lastModified - Bun.file(a).lastModified,
    )[0] ?? ""
  );
};
const sha = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

describe("POST /api/documents/:id/extract", () => {
  test("extracts an uploaded PDF, stores the result, and marks the document EXTRACTED", async () => {
    const { token } = await registerUser();
    const id = await uploadFile(token, samplePdf(), "paper.pdf", PDF_MIME);
    const stored = newestUpload();
    const before = sha(stored);

    const res = await call("POST", `/documents/${id}/extract`, { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        documentId: id,
        documentStatus: "EXTRACTED",
        extraction: {
          status: "COMPLETED",
          errorCode: null,
          result: {
            format: "pdf",
            title: "Synthetic API Test Paper",
            authors: ["Example, A."],
            totalPages: 2,
          },
        },
      },
    });
    if (!res.body.success) return;
    const paragraphs = res.body.data.extraction.result.paragraphs as {
      cleanedText: string;
      pageNumber: number;
    }[];
    expect(paragraphs.map((p) => [p.pageNumber, p.cleanedText])).toEqual([
      [1, "Synthetic claim text on page one [1]."],
      [2, "Synthetic result text on page two (p < 0.05)."],
    ]);

    expect(sha(stored)).toBe(before); // original upload untouched
    const doc = await call("GET", `/documents/${id}`, { token });
    expect(doc.body).toMatchObject({
      data: { document: { status: "EXTRACTED" } },
    });
  });

  test("extracts an uploaded DOCX with null page numbers", async () => {
    const { token } = await registerUser();
    const docx = await buildDocx([
      { type: "heading", level: 1, text: "Methods" },
      { type: "paragraph", text: "A synthetic DOCX paragraph." },
    ]);
    const id = await uploadFile(token, docx, "paper.docx", DOCX_MIME);
    const res = await call("POST", `/documents/${id}/extract`, { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        extraction: {
          status: "COMPLETED",
          result: {
            format: "docx",
            totalPages: null,
            paragraphs: [
              {
                cleanedText: "A synthetic DOCX paragraph.",
                pageNumber: null,
                section: "Methods",
              },
            ],
          },
        },
      },
    });
  });

  test("re-running extraction replaces the previous result", async () => {
    const { token } = await registerUser();
    const id = await uploadFile(token, samplePdf(), "paper.pdf", PDF_MIME);
    await call("POST", `/documents/${id}/extract`, { token });
    const again = await call("POST", `/documents/${id}/extract`, { token });
    expect(again.status).toBe(200);
    expect(
      await prisma.documentExtraction.count({ where: { documentId: id } }),
    ).toBe(1);
  });

  test("a corrupted PDF fails with 422, is recorded as FAILED, and the API keeps working", async () => {
    const { token } = await registerUser();
    const corrupted = new TextEncoder().encode(
      "%PDF-1.4\n<<this is not a real pdf>>",
    );
    const id = await uploadFile(token, corrupted, "broken.pdf", PDF_MIME);

    const res = await call("POST", `/documents/${id}/extract`, { token });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: "EXTRACTION_FAILED",
        details: { reason: "CORRUPTED_FILE" },
      },
    });

    const stored = await call("GET", `/documents/${id}/extraction`, { token });
    expect(stored.body).toMatchObject({
      data: {
        documentStatus: "FAILED",
        extraction: {
          status: "FAILED",
          errorCode: "CORRUPTED_FILE",
          result: null,
        },
      },
    });
    expect((await call("GET", "/health")).status).toBe(200);
  });

  test("an empty PDF is stored as EMPTY and the document marked FAILED", async () => {
    const { token } = await registerUser();
    const id = await uploadFile(token, buildPdf([[]]), "blank.pdf", PDF_MIME);
    const res = await call("POST", `/documents/${id}/extract`, { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: {
        documentStatus: "FAILED",
        extraction: { status: "EMPTY", result: { paragraphs: [] } },
      },
    });
  });

  test("a file missing from storage fails cleanly", async () => {
    const { token } = await registerUser();
    const id = await uploadFile(token, samplePdf(), "paper.pdf", PDF_MIME);
    rmSync(newestUpload());
    const res = await call("POST", `/documents/${id}/extract`, { token });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error: { code: "EXTRACTION_FAILED", details: { reason: "PARSE_ERROR" } },
    });
  });

  test("a document without an uploaded file returns 409", async () => {
    const { token } = await registerUser();
    const created = await call("POST", "/documents", {
      token,
      json: {
        title: "Metadata only",
        originalFilename: "x.pdf",
        fileType: PDF_MIME,
        fileSize: 100,
      },
    });
    if (!created.body.success) throw new Error("create failed");
    const res = await call(
      "POST",
      `/documents/${created.body.data.document.id}/extract`,
      { token },
    );
    expect(res.status).toBe(409);
  });

  test("an extraction already in progress returns 409", async () => {
    const { token } = await registerUser();
    const id = await uploadFile(token, samplePdf(), "paper.pdf", PDF_MIME);
    await prisma.document.update({
      where: { id },
      data: { status: "PROCESSING" },
    });
    const res = await call("POST", `/documents/${id}/extract`, { token });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: { message: "Extraction is already in progress for this document" },
    });
  });

  test("an unsupported stored file type returns 415", async () => {
    const { token, user } = await registerUser();
    const doc = await prisma.document.create({
      data: {
        userId: user.id,
        title: "Odd",
        originalFilename: "a.txt",
        fileType: "text/plain",
        fileSize: 5,
        filePath: "a.txt",
      },
    });
    const res = await call("POST", `/documents/${doc.id}/extract`, { token });
    expect(res.status).toBe(415);
  });
});

describe("GET /api/documents/:id/extraction", () => {
  test("returns null extraction and the processing status before extraction", async () => {
    const { token } = await registerUser();
    const id = await uploadFile(token, samplePdf(), "paper.pdf", PDF_MIME);
    const res = await call("GET", `/documents/${id}/extraction`, { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      data: { documentId: id, documentStatus: "UPLOADED", extraction: null },
    });
  });

  test("returns the stored, validated result after extraction", async () => {
    const { token } = await registerUser();
    const id = await uploadFile(token, samplePdf(), "paper.pdf", PDF_MIME);
    const extracted = await call("POST", `/documents/${id}/extract`, { token });
    const res = await call("GET", `/documents/${id}/extraction`, { token });
    expect(res.status).toBe(200);
    if (!res.body.success || !extracted.body.success)
      throw new Error("expected success");
    expect(res.body.data.extraction.result).toEqual(
      extracted.body.data.extraction.result,
    );
  });
});

describe("extraction access control", () => {
  test("other users get 404 and anonymous requests get 401", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const id = await uploadFile(
      owner.token,
      samplePdf(),
      "paper.pdf",
      PDF_MIME,
    );
    expect(
      (await call("POST", `/documents/${id}/extract`, { token: other.token }))
        .status,
    ).toBe(404);
    expect(
      (await call("GET", `/documents/${id}/extraction`, { token: other.token }))
        .status,
    ).toBe(404);
    expect((await call("POST", `/documents/${id}/extract`)).status).toBe(401);
    expect((await call("GET", `/documents/${id}/extraction`)).status).toBe(401);
  });
});
