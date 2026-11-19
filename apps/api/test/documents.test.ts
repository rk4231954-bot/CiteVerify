import { describe, expect, test } from "bun:test";
import { call, PDF_MIME, registerUser } from "./helpers.ts";

const metadata = {
  title: "Test Doc",
  originalFilename: "test.pdf",
  fileType: PDF_MIME,
  fileSize: 2048,
};

describe("document CRUD", () => {
  test("POST /documents creates a record owned by the caller", async () => {
    const { token } = await registerUser();
    const res = await call("POST", "/documents", { token, json: metadata });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { document: { ...metadata, status: "UPLOADED" } },
    });
    if (!res.body.success) return;
    expect(res.body.data.document).not.toHaveProperty("filePath");
    expect(res.body.data.document).not.toHaveProperty("userId");
  });

  test("POST /documents validates the body", async () => {
    const { token } = await registerUser();
    const res = await call("POST", "/documents", {
      token,
      json: { ...metadata, fileType: "text/plain" },
    });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  test("GET /documents lists only the caller's documents, newest first, paginated", async () => {
    const alice = await registerUser("Alice");
    const bob = await registerUser("Bob");
    await call("POST", "/documents", {
      token: alice.token,
      json: { ...metadata, title: "A1" },
    });
    await call("POST", "/documents", {
      token: alice.token,
      json: { ...metadata, title: "A2" },
    });
    await call("POST", "/documents", {
      token: bob.token,
      json: { ...metadata, title: "B1" },
    });

    const res = await call("GET", "/documents", { token: alice.token });
    expect(res.status).toBe(200);
    if (!res.body.success) throw new Error("expected success");
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items.map((d: { title: string }) => d.title)).toEqual([
      "A2",
      "A1",
    ]);

    const page = await call("GET", "/documents?limit=1&page=2", {
      token: alice.token,
    });
    if (!page.body.success) throw new Error("expected success");
    expect(page.body.data).toMatchObject({ page: 2, limit: 1, total: 2 });
    expect(page.body.data.items).toHaveLength(1);
  });

  test("GET /documents/:id returns details; other users get 404", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await call("POST", "/documents", {
      token: owner.token,
      json: metadata,
    });
    if (!created.body.success) throw new Error("create failed");
    const id = created.body.data.document.id;

    const res = await call("GET", `/documents/${id}`, { token: owner.token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        document: {
          id,
          counts: { claims: 0, citations: 0, references: 0 },
          latestJob: null,
        },
      },
    });

    expect(
      (await call("GET", `/documents/${id}`, { token: other.token })).status,
    ).toBe(404);
    expect(
      (await call("GET", "/documents/missing-id", { token: owner.token }))
        .status,
    ).toBe(404);
  });

  test("DELETE /documents/:id removes only the caller's document", async () => {
    const owner = await registerUser();
    const other = await registerUser();
    const created = await call("POST", "/documents", {
      token: owner.token,
      json: metadata,
    });
    if (!created.body.success) throw new Error("create failed");
    const id = created.body.data.document.id;

    expect(
      (await call("DELETE", `/documents/${id}`, { token: other.token })).status,
    ).toBe(404);
    expect(
      (await call("DELETE", `/documents/${id}`, { token: owner.token })).status,
    ).toBe(200);
    expect(
      (await call("GET", `/documents/${id}`, { token: owner.token })).status,
    ).toBe(404);
  });
});
