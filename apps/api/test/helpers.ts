import { createApp } from "../src/app.ts";

export const app = createApp();

// biome-ignore lint/suspicious/noExplicitAny: tests read response bodies loosely, then assert on them
type Envelope<T = any> =
  | { success: true; data: T }
  | {
      success: false;
      error: { code: string; message: string; details?: unknown };
    };

// biome-ignore lint/suspicious/noExplicitAny: see Envelope
export async function call<T = any>(
  method: string,
  path: string,
  options: { token?: string; json?: unknown; form?: FormData } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let body: RequestInit["body"];
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  const res = await app.request(`/api${path}`, { method, headers, body });
  return { status: res.status, body: (await res.json()) as Envelope<T> };
}

let counter = 0;
/** Registers a fresh test user and returns its token + credentials. */
export async function registerUser(name = "Test User") {
  const email = `user${++counter}-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const password = "test-password-123";
  const res = await call("POST", "/auth/register", {
    json: { name, email, password },
  });
  if (!res.body.success)
    throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return {
    email,
    password,
    token: res.body.data.token as string,
    user: res.body.data.user,
  };
}

export const PDF_BYTES = new TextEncoder().encode(
  "%PDF-1.4\n% synthetic test file\n",
);
export const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function fileForm(
  bytes: Uint8Array,
  name: string,
  type: string,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
}
