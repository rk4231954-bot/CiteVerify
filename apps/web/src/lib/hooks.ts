/** Query hooks for the CiteVerify API. Keys are shared so mutations can invalidate them. */
import { api } from "./api.ts";
import { loadPipeline } from "./pipeline.ts";
import { invalidate, type UseQueryOptions, useQuery } from "./query.ts";
import {
  listAllDocuments,
  loadDocData,
  loadPublications,
  loadWorkspace,
} from "./workspace.ts";

export const useConfig = () =>
  useQuery("config", api.config, { staleTime: 5 * 60_000 });
export const useWorkspace = (opts?: UseQueryOptions) =>
  useQuery("workspace", loadWorkspace, opts);
export const useAllDocuments = () => useQuery("documents", listAllDocuments);
export const useDocument = (id: string | undefined, opts?: UseQueryOptions) =>
  useQuery(
    id ? `doc:${id}` : null,
    () => api.documents.get(id as string).then((r) => r.document),
    opts,
  );
export const usePipeline = (id: string | undefined, opts?: UseQueryOptions) =>
  useQuery(
    id ? `pipeline:${id}` : null,
    () => loadPipeline(id as string),
    opts,
  );
export const useExtraction = (id: string | undefined) =>
  useQuery(id ? `extraction:${id}` : null, () =>
    api.documents.extraction(id as string),
  );
export const useClaims = (id: string | undefined) =>
  useQuery(id ? `claims:${id}` : null, () =>
    api.documents.claims(id as string).then((r) => r.claims),
  );
export const useCitations = (id: string | undefined) =>
  useQuery(id ? `citations:${id}` : null, () =>
    api.documents.citations(id as string).then((r) => r.citations),
  );
export const useReferences = (id: string | undefined) =>
  useQuery(id ? `references:${id}` : null, () =>
    api.documents.references(id as string),
  );
export const usePublications = (id: string | undefined) =>
  useQuery(id ? `publications:${id}` : null, () =>
    api.documents.publications(id as string),
  );
export const useVerification = (id: string | undefined) =>
  useQuery(id ? `verification:${id}` : null, () =>
    api.documents.verification(id as string),
  );
export const usePublication = (id: string | undefined) =>
  useQuery(id ? `pub:${id}` : null, () => api.publications.get(id as string));
export const usePublicationEvidence = (id: string | undefined) =>
  useQuery(id ? `pubevidence:${id}` : null, () =>
    api.publications.evidence(id as string),
  );
export const useClaimVerification = (id: string | undefined) =>
  useQuery(id ? `claimverif:${id}` : null, () =>
    api.claims.verification(id as string),
  );

/** Claims, citations and verification across all documents (for the data grids). */
export const useDocData = () =>
  useQuery("docdata", async () =>
    loadDocData((await listAllDocuments()).items),
  );
/** Retrieved publications across all documents (for discovery). */
export const useAllPublications = () =>
  useQuery("allpubs", async () =>
    loadPublications((await listAllDocuments()).items),
  );

/** Invalidates everything derived from a document after a mutation. */
export function invalidateDocument(id: string): void {
  invalidate(
    `doc:${id}`,
    `pipeline:${id}`,
    `extraction:${id}`,
    `claims:${id}`,
    `citations:${id}`,
    `references:${id}`,
    `publications:${id}`,
    `verification:${id}`,
    "pub:",
    "pubevidence:",
    "claimverif:",
    "workspace",
    "documents",
    "docdata",
    "allpubs",
  );
}
