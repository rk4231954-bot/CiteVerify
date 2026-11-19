export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateTimeFmt.format(d);
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function formatRelative(
  iso: string | null | undefined,
  now = Date.now(),
): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.round((t - now) / 1000);
  const abs = Math.abs(sec);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(sec / 86_400), "day");
  return formatDate(iso);
}

/** 0..1 → "72%". */
export function pct(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction))
    return "—";
  return `${Math.round(fraction * 100)}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** "SCIENTIFIC_FACT" → "Scientific fact". */
export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  const s = value.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? "") +
      (parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : "")
    ).toUpperCase() || "?"
  );
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Splits text into chunks, flagging case-insensitive matches of any term (for <mark> highlighting). */
export function highlightParts(
  text: string,
  terms: string[],
): Array<{ text: string; match: boolean }> {
  const clean = [
    ...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3)),
  ];
  if (clean.length === 0) return [{ text, match: false }];
  const escaped = clean
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter((p) => p !== "")
    .map((p) => ({
      text: p,
      match: clean.some((t) => t.toLowerCase() === p.toLowerCase()),
    }));
}

const STOP = new Set(
  "the a an and or of in on for to with by from at as is are was were be been being that this these those it its into than then their there which who whom whose what when where while not no but also may can could would should has have had do does did more most less such other between among over under after before during within without about".split(
    " ",
  ),
);

/** Content words of a claim, used to highlight related passages. */
export function keyTerms(text: string, max = 12): string[] {
  const words = text
    .replace(/\([^)]*\d{4}[^)]*\)|\[[\d,\s–-]+\]/g, " ")
    .toLowerCase()
    .match(/[a-z][a-z-]{2,}/g);
  if (!words) return [];
  const out: string[] = [];
  for (const w of words) if (!STOP.has(w) && !out.includes(w)) out.push(w);
  return out.slice(0, max);
}
