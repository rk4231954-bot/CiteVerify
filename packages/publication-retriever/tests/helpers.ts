/** Mocked Crossref/OpenAlex HTTP — no test touches the network. */
import {
  createDefaultRetriever,
  type FetchLike,
  type ReferenceQuery,
} from "../src/index.ts";

export type Route = {
  match: (url: URL) => boolean;
  respond: (url: URL, init?: RequestInit) => Response | Promise<Response>;
};

export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

export function mockFetch(routes: Route[]) {
  const calls: URL[] = [];
  const fetch: FetchLike = async (input, init) => {
    const url = new URL(input);
    calls.push(url);
    const route = routes.find((r) => r.match(url));
    if (!route) return json({ message: "not found" }, 404);
    return route.respond(url, init);
  };
  return { fetch, calls };
}

export const isCrossref = (u: URL) => u.hostname === "api.crossref.org";
export const isOpenAlex = (u: URL) => u.hostname === "api.openalex.org";
export const decodedPath = (u: URL) => decodeURIComponent(u.pathname);

export const silentLogger = { warn: () => {} };
export const noSleep = async () => {};

export function retrieverWith(
  fetch: FetchLike,
  extra: Parameters<typeof createDefaultRetriever>[0] = {},
) {
  return createDefaultRetriever({
    fetch,
    logger: silentLogger,
    sleep: noSleep,
    minIntervalMs: 0,
    retryBaseDelayMs: 0,
    ...extra,
  });
}

export function ref(partial: Partial<ReferenceQuery>): ReferenceQuery {
  return {
    id: "ref-1",
    rawText: "",
    doi: null,
    title: null,
    authors: [],
    year: null,
    ...partial,
  };
}

// ─── Synthetic provider records (fictional works) ─────────────────────────

export const SLEEP_DOI = "10.5555/sleep.2020.001";
export const SLEEP_TITLE =
  "Sleep duration and working memory in healthy adults";

export const crossrefSleep = {
  DOI: SLEEP_DOI,
  title: [SLEEP_TITLE],
  author: [
    { given: "Jane", family: "Doe" },
    { given: "Wei", family: "Chen" },
  ],
  issued: { "date-parts": [[2020, 3]] },
  "container-title": ["Journal of Synthetic Sleep Research"],
  publisher: "Example Press",
  abstract:
    "<jats:title>Abstract</jats:title><jats:p>We studied sleep &amp; memory.</jats:p>",
  URL: `https://doi.org/${SLEEP_DOI}`,
  type: "journal-article",
};

export const openAlexSleep = {
  id: "https://openalex.org/W1000000001",
  doi: `https://doi.org/${SLEEP_DOI.toUpperCase()}`,
  title: SLEEP_TITLE,
  display_name: SLEEP_TITLE,
  publication_year: 2020,
  type: "article",
  authorships: [
    { author: { display_name: "Jane Doe" } },
    { author: { display_name: "Wei Chen" } },
  ],
  primary_location: {
    landing_page_url: "https://example.org/sleep",
    source: {
      display_name: "Journal of Synthetic Sleep Research",
      host_organization_name: "Example Press",
    },
  },
  open_access: {
    is_oa: true,
    oa_status: "gold",
    oa_url: "https://example.org/sleep.pdf",
  },
  abstract_inverted_index: { Sleep: [0], matters: [1], for: [2], memory: [3] },
};

export const crossrefWork = (body: unknown) =>
  json({ status: "ok", "message-type": "work", message: body });
export const crossrefList = (items: unknown[]) =>
  json({ status: "ok", "message-type": "work-list", message: { items } });
export const openAlexList = (results: unknown[]) =>
  json({ meta: { count: results.length }, results });
