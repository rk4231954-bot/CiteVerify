import { type Prisma, prisma, serializeAuthors } from "@citeverify/database";
import type { NormalizedPublication } from "@citeverify/publication-retriever";
import { RetrievalStatus } from "@citeverify/shared";

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "P2002";

function mergeProviders(existing: string | null, added: string[]) {
  const all = [...(existing?.split(",") ?? []), ...added].filter(Boolean);
  return [...new Set(all)].join(",");
}

type PublicationRow = Prisma.PublicationGetPayload<object>;

/** Values for fields that are empty on the existing row — reliable data is never overwritten. */
function fillMissing(
  row: PublicationRow,
  pub: NormalizedPublication,
  providers: string[],
  now: Date,
): Prisma.PublicationUpdateInput {
  const data: Prisma.PublicationUpdateInput = {};
  const authorsEmpty = !row.authors || row.authors === "[]";
  if (authorsEmpty && pub.authors.length)
    data.authors = serializeAuthors(pub.authors);
  if (row.year === null && pub.year !== null) data.year = pub.year;
  if (!row.doi && pub.doi) data.doi = pub.doi;
  if (!row.abstract && pub.abstract) data.abstract = pub.abstract;
  if (!row.sourceUrl && pub.url) data.sourceUrl = pub.url;
  if (!row.publisher && pub.publisher) data.publisher = pub.publisher;
  if (!row.journal && pub.journal) data.journal = pub.journal;
  if (!row.openAlexId && pub.openAlexId) data.openAlexId = pub.openAlexId;
  // false is the column default ("not known to be OA"), so true from a provider fills it in.
  if (!row.openAccess && pub.openAccess === true) data.openAccess = true;
  if (!row.openAccessStatus && pub.openAccessStatus)
    data.openAccessStatus = pub.openAccessStatus;
  if (!row.openAccessUrl && pub.openAccessUrl)
    data.openAccessUrl = pub.openAccessUrl;
  const provider = mergeProviders(row.provider, providers);
  if (provider !== row.provider) data.provider = provider;
  data.retrievalStatus = RetrievalStatus.RETRIEVED;
  data.retrievedAt = now;
  return data;
}

export const publicationRepository = {
  /** Same work = same DOI; else same OpenAlex id, unless that row has a different DOI. */
  async findByKeys(doi: string | null, openAlexId: string | null) {
    if (doi) {
      const byDoi = await prisma.publication.findUnique({ where: { doi } });
      if (byDoi) return byDoi;
    }
    if (!openAlexId) return null;
    const byOpenAlex = await prisma.publication.findUnique({
      where: { openAlexId },
    });
    return byOpenAlex && (!byOpenAlex.doi || !doi || byOpenAlex.doi === doi)
      ? byOpenAlex
      : null;
  },

  /**
   * Saves a matched publication, deduplicated by DOI (then OpenAlex id).
   * An existing row keeps its values; only empty fields are filled.
   */
  async upsert(
    pub: NormalizedPublication,
    providers: string[],
    now = new Date(),
  ) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = await publicationRepository.findByKeys(
        pub.doi,
        pub.openAlexId,
      );
      try {
        if (existing) {
          const data = fillMissing(existing, pub, providers, now);
          // Another row may already own this OpenAlex id / DOI (found by the other key).
          if (
            data.openAlexId &&
            (await prisma.publication.findUnique({
              where: { openAlexId: pub.openAlexId ?? "" },
            }))
          )
            delete data.openAlexId;
          if (
            data.doi &&
            (await prisma.publication.findUnique({
              where: { doi: pub.doi ?? "" },
            }))
          )
            delete data.doi;
          return {
            publication: await prisma.publication.update({
              where: { id: existing.id },
              data,
            }),
            created: false,
          };
        }
        // The OpenAlex id may belong to a row with a different DOI: keep the DOI as the key.
        const idTaken = pub.openAlexId
          ? await prisma.publication.findUnique({
              where: { openAlexId: pub.openAlexId },
              select: { id: true },
            })
          : null;
        return {
          publication: await prisma.publication.create({
            data: {
              title: pub.title,
              authors: pub.authors.length
                ? serializeAuthors(pub.authors)
                : null,
              year: pub.year,
              doi: pub.doi,
              abstract: pub.abstract,
              sourceUrl: pub.url,
              publisher: pub.publisher,
              journal: pub.journal,
              openAlexId: idTaken ? null : pub.openAlexId,
              openAccess: pub.openAccess === true,
              openAccessStatus: pub.openAccessStatus,
              openAccessUrl: pub.openAccessUrl,
              provider: mergeProviders(null, providers),
              retrievalStatus: RetrievalStatus.RETRIEVED,
              retrievedAt: now,
            },
          }),
          created: true,
        };
      } catch (error) {
        // A concurrent request created the same publication: retry as an update.
        if (attempt === 0 && isUniqueViolation(error)) continue;
        throw error;
      }
    }
    throw new Error("unreachable");
  },

  referencesForDocument: (documentId: string, ids?: string[]) =>
    prisma.reference.findMany({
      where: { documentId, ...(ids ? { id: { in: ids } } : {}) },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),

  updateReference: (id: string, data: Prisma.ReferenceUncheckedUpdateInput) =>
    prisma.reference.update({ where: { id }, data }),

  referencesWithPublications: (documentId: string, status?: string) =>
    prisma.reference.findMany({
      where: {
        documentId,
        ...(status ? { publicationMatchStatus: status } : {}),
      },
      include: { publication: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),

  /** A publication is visible to a user only through one of their documents' references. */
  findForUser: (id: string, userId: string) =>
    prisma.publication.findFirst({
      where: { id, references: { some: { document: { userId } } } },
      include: {
        references: {
          where: { document: { userId } },
          select: {
            id: true,
            documentId: true,
            label: true,
            rawText: true,
            publicationMatchStatus: true,
            publicationMatchConfidence: true,
          },
          orderBy: [{ documentId: "asc" }, { position: "asc" }],
        },
      },
    }),

  findReferenceForUser: (id: string, userId: string) =>
    prisma.reference.findFirst({
      where: { id, document: { userId } },
      include: { publication: true },
    }),
};
