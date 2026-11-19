/** Maps with at most `limit` promises in flight (keeps per-document fan-out polite). */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T, i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

/** Resolves to `fallback` instead of throwing (for optional per-document lookups). */
export async function settle<T, F>(p: Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}
