/** Live connection status of the CiteVerify API (polls GET /api/health). */
import { API_CONFIGURED, API_ORIGIN, ApiError, api } from "./api.ts";
import { useQuery } from "./query.ts";

export type BackendState =
  | "not-configured"
  | "checking"
  | "online"
  | "degraded"
  | "offline";

export interface BackendStatus {
  state: BackendState;
  /** Where the API is expected (shown in the status details). */
  target: string;
  message: string;
  checkedAt: number | null;
  recheck: () => void;
}

const MESSAGES: Record<BackendState, string> = {
  "not-configured":
    "This deployment has no API configured. Pages load for preview, but signing in and all data features are unavailable.",
  checking: "Checking the connection to the CiteVerify API…",
  online: "Connected to the CiteVerify API.",
  degraded:
    "The API is reachable but reports a problem (for example its database is unavailable).",
  offline:
    "The CiteVerify API cannot be reached. Data features are unavailable until it is back.",
};

export function useBackendStatus(): BackendStatus {
  const q = useQuery(API_CONFIGURED ? "health" : null, api.health, {
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  let state: BackendState;
  if (!API_CONFIGURED) state = "not-configured";
  else if (q.error)
    state =
      q.error instanceof ApiError && q.error.status >= 500
        ? "degraded"
        : "offline";
  else if (q.data)
    state =
      q.data.database === "connected" || q.data.status === "ok"
        ? "online"
        : "degraded";
  else state = "checking";
  return {
    state,
    target: API_ORIGIN
      ? `${API_ORIGIN}/api`
      : API_CONFIGURED
        ? "same origin /api (development proxy)"
        : "not set (VITE_API_BASE_URL)",
    message:
      q.error instanceof ApiError &&
      state !== "not-configured" &&
      q.error.code === "BAD_RESPONSE"
        ? q.error.message
        : MESSAGES[state],
    checkedAt: q.updatedAt || null,
    recheck: () => {
      void q.refetch();
    },
  };
}
