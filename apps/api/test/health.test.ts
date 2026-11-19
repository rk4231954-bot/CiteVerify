import { describe, expect, test } from "bun:test";
import { call } from "./helpers.ts";

describe("GET /api/health", () => {
  test("reports app and database status", async () => {
    const res = await call("GET", "/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { status: "ok", database: "connected" },
    });
  });

  test("unknown routes return the standard 404 envelope", async () => {
    const res = await call("GET", "/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
