/**
 * Safe error logging. Logs never include request bodies, headers or tokens, and
 * credentials embedded in messages (connection strings, bearer tokens, JWTs)
 * are masked before anything is printed.
 */

const REDACTIONS: [RegExp, string][] = [
  // scheme://user:password@host → scheme://user:***@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:)[^@\s]+@/gi, "$1***@"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer ***"],
  // JSON Web Tokens
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "***jwt***"],
  [/\b(password|secret|token|api[_-]?key)=([^\s&]+)/gi, "$1=***"],
];

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REDACTIONS)
    out = out.replace(pattern, replacement);
  return out;
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return redact(`${error.name}: ${error.message}`);
  return redact(String(error));
}

/**
 * Logs an error with request context. Development prints the stack; production
 * prints one line per error (name, code, message, request) plus the redacted
 * stack, which hosts such as Railway keep in their log viewer.
 */
export function logError(
  label: string,
  error: unknown,
  context: { method?: string; path?: string } = {},
): void {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  const where = context.method
    ? ` ${context.method} ${context.path ?? ""}`
    : "";
  const line = `[api] ${label}${where}${code ? ` [${code}]` : ""}: ${safeErrorMessage(error)}`;
  const stack =
    error instanceof Error && error.stack
      ? redact(error.stack.split("\n").slice(1).join("\n"))
      : "";
  console.error(stack ? `${line}\n${stack}` : line);
}
