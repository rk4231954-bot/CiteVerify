import { expect, test } from "bun:test";
import { resolveApiOrigin } from "../src/lib/api.ts";

test("resolveApiOrigin normalises the configured API URL", () => {
  expect(resolveApiOrigin({})).toBe("");
  expect(
    resolveApiOrigin({ VITE_API_BASE_URL: "https://api.example.com/" }),
  ).toBe("https://api.example.com");
  expect(
    resolveApiOrigin({ VITE_API_BASE_URL: "https://api.example.com/api" }),
  ).toBe("https://api.example.com");
  expect(resolveApiOrigin({ VITE_API_BASE_URL: " https://x.dev/api/ " })).toBe(
    "https://x.dev",
  );
  // Legacy name still works; the new name wins.
  expect(resolveApiOrigin({ VITE_API_URL: "https://old.dev" })).toBe(
    "https://old.dev",
  );
  expect(
    resolveApiOrigin({
      VITE_API_BASE_URL: "https://new.dev",
      VITE_API_URL: "https://old.dev",
    }),
  ).toBe("https://new.dev");
});
