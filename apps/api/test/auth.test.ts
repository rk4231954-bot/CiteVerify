import { describe, expect, test } from "bun:test";
import { call, registerUser } from "./helpers.ts";

describe("POST /api/auth/register", () => {
  test("creates a user, returns a token, never the password hash", async () => {
    const res = await call("POST", "/auth/register", {
      json: {
        name: "Ada",
        email: "  Ada@Test.Local ",
        password: "correct-horse",
      },
    });
    expect(res.status).toBe(201);
    if (!res.body.success) throw new Error("expected success");
    expect(res.body.data.user).toMatchObject({
      name: "Ada",
      email: "ada@test.local",
    });
    expect(typeof res.body.data.token).toBe("string");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  test("rejects a duplicate email with 409", async () => {
    const { email } = await registerUser();
    const res = await call("POST", "/auth/register", {
      json: {
        name: "Dup",
        email: email.toUpperCase(),
        password: "another-pass",
      },
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "CONFLICT" },
    });
  });

  test("rejects invalid input with field-level details", async () => {
    const res = await call("POST", "/auth/register", {
      json: { email: "not-an-email", password: "short" },
    });
    expect(res.status).toBe(400);
    if (res.body.success) throw new Error("expected failure");
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const paths = (res.body.error.details as { path: string }[]).map(
      (d) => d.path,
    );
    expect(paths).toEqual(
      expect.arrayContaining(["name", "email", "password"]),
    );
  });
});

describe("POST /api/auth/login", () => {
  test("returns a token for valid credentials", async () => {
    const { email, password } = await registerUser();
    const res = await call("POST", "/auth/login", {
      json: { email, password },
    });
    expect(res.status).toBe(200);
    if (!res.body.success) throw new Error("expected success");
    expect(res.body.data.user.email).toBe(email);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  test("rejects a wrong password and an unknown email identically", async () => {
    const { email } = await registerUser();
    const wrong = await call("POST", "/auth/login", {
      json: { email, password: "wrong-password" },
    });
    const unknown = await call("POST", "/auth/login", {
      json: { email: "ghost@test.local", password: "whatever1" },
    });
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: "INVALID_CREDENTIALS" },
      });
    }
  });
});

describe("auth middleware", () => {
  test("GET /auth/me returns the current user with a valid token", async () => {
    const { token, user } = await registerUser("Me");
    const res = await call("GET", "/auth/me", { token });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { user: { id: user.id, name: "Me" } },
    });
  });

  test("rejects requests without a token", async () => {
    for (const path of ["/auth/me", "/documents"]) {
      const res = await call("GET", path);
      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        success: false,
        error: { code: "UNAUTHORIZED" },
      });
    }
  });

  test("rejects malformed and tampered tokens", async () => {
    const { token } = await registerUser();
    const tampered = `${token.slice(0, -2)}xx`;
    for (const bad of ["not-a-jwt", tampered]) {
      const res = await call("GET", "/documents", { token: bad });
      expect(res.status).toBe(401);
    }
  });
});
