/**
 * Minimal query cache (TanStack Query is not part of this project): keyed
 * entries, request de-duplication, prefix invalidation, polling, and
 * stale-while-revalidate rendering via useSyncExternalStore.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export interface QueryState<T> {
  data: T | undefined;
  error: unknown;
  /** No data yet and a request is running. */
  isLoading: boolean;
  /** A request is running (initial load or background refresh). */
  isFetching: boolean;
  updatedAt: number;
}

interface Entry {
  state: QueryState<unknown>;
  promise: Promise<unknown> | null;
  fetcher: (() => Promise<unknown>) | null;
  stale: boolean;
  listeners: Set<() => void>;
}

const EMPTY: QueryState<never> = {
  data: undefined,
  error: undefined,
  isLoading: false,
  isFetching: false,
  updatedAt: 0,
};

const cache = new Map<string, Entry>();

function entryFor(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = {
      state: EMPTY,
      promise: null,
      fetcher: null,
      stale: true,
      listeners: new Set(),
    };
    cache.set(key, e);
  }
  return e;
}

function setState(e: Entry, patch: Partial<QueryState<unknown>>) {
  e.state = { ...e.state, ...patch };
  for (const l of e.listeners) l();
}

/** Runs (or joins) the request for `key` and stores its result. */
export function fetchQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const e = entryFor(key);
  e.fetcher = fetcher;
  if (e.promise) return e.promise as Promise<T>;
  setState(e, { isFetching: true, isLoading: e.state.data === undefined });
  const p = fetcher().then(
    (data) => {
      e.promise = null;
      e.stale = false;
      setState(e, {
        data,
        error: undefined,
        isFetching: false,
        isLoading: false,
        updatedAt: Date.now(),
      });
      return data;
    },
    (error: unknown) => {
      e.promise = null;
      setState(e, { error, isFetching: false, isLoading: false });
      throw error;
    },
  );
  e.promise = p;
  return p;
}

/** Marks every entry whose key starts with one of the prefixes stale and refetches the mounted ones. */
export function invalidate(...prefixes: string[]): void {
  for (const [key, e] of cache) {
    if (
      !prefixes.some(
        (p) => key === p || key.startsWith(`${p}:`) || key.startsWith(p),
      )
    )
      continue;
    e.stale = true;
    if (e.listeners.size > 0 && e.fetcher)
      fetchQuery(key, e.fetcher).catch(() => {});
  }
}

/** Replaces cached data without a request (e.g. with a mutation's response). */
export function setQueryData<T>(key: string, data: T): void {
  const e = entryFor(key);
  e.stale = false;
  setState(e, { data, error: undefined, updatedAt: Date.now() });
}

export function getQueryData<T>(key: string): T | undefined {
  return cache.get(key)?.state.data as T | undefined;
}

export function clearQueries(): void {
  cache.clear();
}

export interface UseQueryOptions {
  /** Re-request in the background while mounted (ms). `false`/0 disables. */
  refetchInterval?: number | false;
  /** Data younger than this is reused on mount without a request (ms). */
  staleTime?: number;
  enabled?: boolean;
}

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  {
    refetchInterval = false,
    staleTime = 15_000,
    enabled = true,
  }: UseQueryOptions = {},
): QueryState<T> & { refetch: () => Promise<T | undefined> } {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const active = key !== null && enabled;

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!key) return () => {};
      const e = entryFor(key);
      e.listeners.add(listener);
      return () => e.listeners.delete(listener);
    },
    [key],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => (key ? entryFor(key).state : EMPTY),
    () => EMPTY,
  ) as QueryState<T>;

  useEffect(() => {
    if (!active || !key) return;
    const e = entryFor(key);
    const fresh = !e.stale && Date.now() - e.state.updatedAt < staleTime;
    if (!fresh) fetchQuery(key, () => fetcherRef.current()).catch(() => {});
    else e.fetcher = () => fetcherRef.current();
  }, [key, active, staleTime]);

  useEffect(() => {
    if (!active || !key || !refetchInterval) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible")
        fetchQuery(key, () => fetcherRef.current()).catch(() => {});
    }, refetchInterval);
    return () => clearInterval(id);
  }, [key, active, refetchInterval]);

  const refetch = useCallback(async () => {
    if (!key) return undefined;
    return fetchQuery(key, () => fetcherRef.current());
  }, [key]);

  return { ...state, refetch };
}
