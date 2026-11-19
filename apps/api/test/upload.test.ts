import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { env } from "../src/config/env.ts";
import {
  call,
  DOCX_BYTES,
  DOCX_MIME,
  fileForm,
  PDF_BYTES,
  PDF_MIME,
  registerUser,
} from "./helpers.ts";

const upload = (token: string | undefined, form: FormData) =>
  call("POST", "/documents/upload", { token, form });

describe("POST /api/documents/upload", () => {
  test("stores a valid PDF under a unique name and records metadata", async () => {
    const { token } = await registerUser();
    const res = await upload(
      token,
      fileForm(PDF_BYTES, "My Paper.pdf", PDF_MIME),
    );
    expect(res.status).toBe(201);
    if (!res.body.success) throw new Error(JSON.stringify(res.body));
    expect(res.body.data).toMatchObject({
      status: "UPLOADED",
      document: {
        title: "My Paper",
        originalFilename: "My Paper.pdf",
        fileType: PDF_MIME,
        fileSize: PDF_BYTES.length,
      },
    });
    const stored = readdirSync(env.UPLOAD_DIR);
    expect(stored.some((f) => /^[0-9a-f-]{36}\.pdf$/.test(f))).toBe(true);
    expect(stored).not.toContain("My Paper.pdf");
  });

  test("accepts a DOCX with an explicit title", async () => {
    const { token } = await registerUser();
    const res = await upload(
      token,
      fileForm(DOCX_BYTES, "draft.docx", DOCX_MIME, { title: "Draft" }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { document: { title: "Draft", fileType: DOCX_MIME } },
    });
  });

  test("deleting an uploaded document removes its file", async () => {
    const { token } = await registerUser();
    const before = new Set(readdirSync(env.UPLOAD_DIR));
    const res = await upload(token, fileForm(PDF_BYTES, "temp.pdf", PDF_MIME));
    if (!res.body.success) throw new Error("upload failed");
    const added = readdirSync(env.UPLOAD_DIR).filter((f) => !before.has(f));
    expect(added).toHaveLength(1);

    await call("DELETE", `/documents/${res.body.data.id}`, { token });
    expect(existsSync(`${env.UPLOAD_DIR}/${added[0]}`)).toBe(false);
  });

  test.each([
    ["unsupported extension", fileForm(PDF_BYTES, "notes.txt", "text/plain")],
    ["no extension", fileForm(PDF_BYTES, "paper", PDF_MIME)],
    [
      "content is not really a PDF",
      fileForm(new TextEncoder().encode("hello"), "fake.pdf", PDF_MIME),
    ],
    [
      "DOCX extension with PDF content",
      fileForm(PDF_BYTES, "fake.docx", DOCX_MIME),
    ],
  ])("rejects %s with 415", async (_label, form) => {
    const { token } = await registerUser();
    const res = await upload(token, form);
    expect(res.status).toBe(415);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "UNSUPPORTED_FILE_TYPE" },
    });
  });

  test("rejects files over MAX_FILE_SIZE with 413", async () => {
    const { token } = await registerUser();
    const big = new Uint8Array(env.MAX_FILE_SIZE + 1);
    big.set(PDF_BYTES);
    const res = await upload(token, fileForm(big, "big.pdf", PDF_MIME));
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "FILE_TOO_LARGE" },
    });
  });

  test("rejects a missing file and an empty file with 400", async () => {
    const { token } = await registerUser();
    const noFile = new FormData();
    noFile.append("title", "x");
    expect((await upload(token, noFile)).status).toBe(400);
    expect(
      (await upload(token, fileForm(new Uint8Array(0), "empty.pdf", PDF_MIME)))
        .status,
    ).toBe(400);
  });

  test("requires authentication", async () => {
    const res = await upload(undefined, fileForm(PDF_BYTES, "a.pdf", PDF_MIME));
    expect(res.status).toBe(401);
  });
});
