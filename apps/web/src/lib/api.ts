/**
 * Thin client for the CiteVerify API. Every endpoint returns the envelope
 * `{ success: true, data }` or `{ success: false, error: { code, message, details } }`.
 */
import type {
  AppConfig,
  AuthResponse,
  CitationList,
  ClaimDetail,
  ClaimList,
  ClaimVerification,
  DetectCitationsResponse,
  DocumentDetail,
  DocumentList,
  DocumentPublications,
  DocumentVerification,
  ExtractClaimsResponse,
  ExtractEvidenceResponse,
  ExtractionResponse,
  PublicationDetail,
  PublicationEvidence,
  ReferenceList,
  RetrievePublicationsResponse,
  UploadResponse,
  User,
  VerificationStatus,
} from "./types.ts";

/**
 * Origin of the CiteVerify API, from `VITE_API_BASE_URL` (or the older
 * `VITE_API_URL`). A trailing `/api` is accepted and stripped.
 * In development an empty value means "same origin" (the Vite proxy).
 * Production builds never fall back to same-origin `/api`: on a static host
 * that path would be served the SPA's index.html, not the API.
 */
export function resolveApiOrigin(env: {
  VITE_API_BASE_URL?: string;
  VITE_API_URL?: string;
}): string {
  return (env.VITE_API_BASE_URL || env.VITE_API_URL || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api$/, "");
}
export const API_ORIGIN = resolveApiOrigin(import.meta.env);
export const API_BASE = `${API_ORIGIN}/api`;
/** False when this build has no API to talk to (production without `VITE_API_BASE_URL`). */
export const API_CONFIGURED = Boolean(API_ORIGIN) || import.meta.env.DEV;

const TOKEN_KEY = "citeverify.token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** The API could not be used at all (offline, unreachable or not configured). */
  get isNetwork(): boolean {
    return (
      this.code === "NETWORK_ERROR" ||
      this.code === "API_NOT_CONFIGURED" ||
      this.code === "BAD_RESPONSE"
    );
  }
  get isAuth(): boolean {
    return this.status === 401;
  }
  /** Field errors from a VALIDATION_ERROR response, keyed by field path. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    const issues = Array.isArray(this.details)
      ? (this.details as Array<{ path?: unknown; message?: string }>)
      : [];
    for (const issue of issues) {
      const key = Array.isArray(issue.path)
        ? issue.path.join(".")
        : String(issue.path ?? "");
      if (key && issue.message && !out[key]) out[key] = issue.message;
    }
    return out;
  }
}

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// ── session token ────────────────────────────────────────────────────────────
let token: string | null = readToken();
const unauthorizedListeners = new Set<() => void>();

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode): keep the in-memory token only
  }
}

/** Called when an authenticated request is rejected (expired/invalid token). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

const NETWORK_MESSAGE =
  "Cannot reach the CiteVerify API. Check that the server is running and your connection is online.";

const NOT_CONFIGURED_MESSAGE =
  "This deployment is not connected to a CiteVerify API (VITE_API_BASE_URL is not set). Pages load, but signing in and all data features are unavailable.";

const notConfigured = () =>
  new ApiError(0, "API_NOT_CONFIGURED", NOT_CONFIGURED_MESSAGE);

/** A response that is not the API's JSON envelope (e.g. an HTML page from a static host or proxy). */
const badResponse = (status: number) =>
  new ApiError(
    status,
    "BAD_RESPONSE",
    `The server at ${API_BASE} did not respond like the CiteVerify API (HTTP ${status}, not JSON). Check the configured API URL.`,
  );

function toApiError(status: number, body: unknown): ApiError {
  const err = (
    body as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null
  )?.error;
  return new ApiError(
    status,
    err?.code ?? (status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR"),
    err?.message ?? `Request failed (HTTP ${status})`,
    err?.details,
  );
}

function handleAuthFailure(error: ApiError, hadToken: boolean) {
  if (error.status === 401 && hadToken)
    for (const l of unauthorizedListeners) l();
}

async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!API_CONFIGURED) throw notConfigured();
  const headers: Record<string, string> = { Accept: "application/json" };
  const hadToken = Boolean(token);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if ((cause as Error)?.name === "AbortError") throw cause;
    throw new ApiError(0, "NETWORK_ERROR", NETWORK_MESSAGE);
  }

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (json === null || typeof json !== "object") throw badResponse(res.status);
  const envelope = json as { success?: boolean; data?: T } | null;
  if (!res.ok || !envelope?.success) {
    const error = toApiError(res.status, json);
    handleAuthFailure(error, hadToken);
    throw error;
  }
  return envelope.data as T;
}

const get = <T>(path: string, signal?: AbortSignal) =>
  request<T>("GET", path, undefined, signal);
const post = <T>(path: string, body?: unknown) =>
  request<T>("POST", path, body ?? {});
const del = <T>(path: string) => request<T>("DELETE", path);

function qs(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Multipart upload with progress (fetch cannot report upload progress). */
function uploadDocument(
  file: File,
  opts: {
    title?: string;
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<UploadResponse> {
  if (!API_CONFIGURED) return Promise.reject(notConfigured());
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const hadToken = Boolean(token);
    xhr.open("POST", `${API_BASE}/documents/upload`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "NETWORK_ERROR", NETWORK_MESSAGE));
    xhr.onabort = () => reject(new ApiError(0, "ABORTED", "Upload cancelled."));
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        json = null;
      }
      if (json === null || typeof json !== "object") {
        reject(badResponse(xhr.status));
        return;
      }
      const envelope = json as {
        success?: boolean;
        data?: UploadResponse;
      } | null;
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        envelope?.success &&
        envelope.data
      ) {
        opts.onProgress?.(1);
        resolve(envelope.data);
      } else {
        const error = toApiError(xhr.status, json);
        handleAuthFailure(error, hadToken);
        reject(error);
      }
    };
    opts.signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", file);
    if (opts.title?.trim()) form.append("title", opts.title.trim());
    xhr.send(form);
  });
}

export type Method = "RULE_BASED" | "AI";

export const api = {
  config: () => get<AppConfig>("/config"),
  health: () => get<{ status: string; database: string }>("/health"),

  auth: {
    login: (body: { email: string; password: string }) =>
      post<AuthResponse>("/auth/login", body),
    register: (body: { name: string; email: string; password: string }) =>
      post<AuthResponse>("/auth/register", body),
    me: () => get<{ user: User }>("/auth/me"),
  },

  documents: {
    list: (page = 1, limit = 100) =>
      get<DocumentList>(`/documents${qs({ page, limit })}`),
    get: (id: string) => get<{ document: DocumentDetail }>(`/documents/${id}`),
    upload: uploadDocument,
    remove: (id: string) => del<unknown>(`/documents/${id}`),
    extract: (id: string) =>
      post<ExtractionResponse>(`/documents/${id}/extract`),
    extraction: (id: string) =>
      get<ExtractionResponse>(`/documents/${id}/extraction`),
    extractClaims: (
      id: string,
      body: { method?: Method; replace?: boolean } = {},
    ) => post<ExtractClaimsResponse>(`/documents/${id}/extract-claims`, body),
    claims: (id: string, page = 1, limit = 200) =>
      get<ClaimList>(`/documents/${id}/claims${qs({ page, limit })}`),
    detectCitations: (id: string) =>
      post<DetectCitationsResponse>(`/documents/${id}/detect-citations`),
    citations: (id: string, page = 1, limit = 500) =>
      get<CitationList>(`/documents/${id}/citations${qs({ page, limit })}`),
    references: (id: string) =>
      get<ReferenceList>(`/documents/${id}/references`),
    retrievePublications: (id: string, body: { force?: boolean } = {}) =>
      post<RetrievePublicationsResponse>(
        `/documents/${id}/retrieve-publications`,
        body,
      ),
    publications: (id: string) =>
      get<DocumentPublications>(`/documents/${id}/publications`),
    verify: (
      id: string,
      body: { method?: Method; extractMissingEvidence?: boolean } = {},
    ) => post<DocumentVerification>(`/documents/${id}/verify`, body),
    verification: (id: string, jobId?: string) =>
      get<DocumentVerification>(
        `/documents/${id}/verification${qs({ jobId })}`,
      ),
    verificationStatus: (id: string) =>
      get<VerificationStatus>(`/documents/${id}/verification/status`),
  },

  claims: {
    get: (id: string) => get<{ claim: ClaimDetail }>(`/claims/${id}`),
    verification: (id: string) =>
      get<ClaimVerification>(`/claims/${id}/verification`),
  },

  publications: {
    get: (id: string) => get<PublicationDetail>(`/publications/${id}`),
    evidence: (id: string) =>
      get<PublicationEvidence>(`/publications/${id}/evidence`),
    extractEvidence: (
      id: string,
      body: { fullText?: boolean; method?: Method; replace?: boolean } = {},
    ) =>
      post<ExtractEvidenceResponse>(
        `/publications/${id}/extract-evidence`,
        body,
      ),
  },
};
