/**
 * Allowed browser origins for CORS, from FRONTEND_URL.
 *
 * FRONTEND_URL is a comma-separated list of origins (scheme + host + optional
 * port, no path), e.g.
 *
 *   https://citeverify.vercel.app,https://citeverify-*-kiranmayi2.vercel.app
 *
 * One `*` may appear inside the first host label to match Vercel preview URLs
 * (it matches letters, digits and hyphens only). A wildcard that would be a
 * whole label (`https://*.vercel.app`) is rejected: it would admit every
 * project on the platform.
 */

export interface OriginRule {
  /** The entry as configured (shown in logs and errors). */
  source: string;
  test: (origin: string) => boolean;
}

const LABEL = "[a-z0-9-]+";

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parses one entry, or returns an error message. */
export function parseOriginRule(entry: string): OriginRule | string {
  const source = entry.trim().replace(/\/+$/, "");
  const match = /^(https?):\/\/([^/?#]+)$/i.exec(source);
  if (!match)
    return `"${entry}" is not an origin (expected https://host[:port], no path)`;
  const [, scheme, hostPort] = match as unknown as [string, string, string];
  const lower = `${scheme.toLowerCase()}://${hostPort.toLowerCase()}`;

  if (!hostPort.includes("*")) {
    try {
      const url = new URL(lower);
      if (url.origin !== lower) return `"${entry}" is not a plain origin`;
    } catch {
      return `"${entry}" is not a valid URL`;
    }
    return { source: lower, test: (origin) => origin.toLowerCase() === lower };
  }

  const labels = hostPort.toLowerCase().split(".");
  const [first = "", ...rest] = labels;
  const wildcards = hostPort.split("*").length - 1;
  if (
    wildcards !== 1 ||
    !first.includes("*") ||
    first === "*" ||
    rest.length < 2 ||
    !/^[a-z0-9*-]+$/.test(first)
  )
    return `"${entry}": a wildcard must sit inside the first host label next to fixed text, e.g. https://myapp-*-team.vercel.app`;
  const [before, after] = first.split("*") as [string, string];
  const pattern = new RegExp(
    `^${escapeRegExp(`${scheme.toLowerCase()}://${before}`)}${LABEL}${escapeRegExp(after + (rest.length ? `.${rest.join(".")}` : ""))}$`,
  );
  return {
    source: lower,
    test: (origin) => pattern.test(origin.toLowerCase()),
  };
}

/** Parses the comma-separated list; returns the rules and any invalid entries. */
export function parseOriginList(value: string): {
  rules: OriginRule[];
  errors: string[];
} {
  const rules: OriginRule[] = [];
  const errors: string[] = [];
  for (const entry of value.split(",")) {
    if (!entry.trim()) continue;
    const rule = parseOriginRule(entry);
    if (typeof rule === "string") errors.push(rule);
    else rules.push(rule);
  }
  if (!rules.length && !errors.length) errors.push("no origin configured");
  return { rules, errors };
}

/** Returns `origin` when it is allowed, otherwise null (no CORS headers are sent). */
export function matchOrigin(
  rules: readonly OriginRule[],
  origin: string | undefined,
): string | null {
  if (!origin) return null;
  return rules.some((r) => r.test(origin)) ? origin : null;
}
