import { type Prisma, prisma } from "@citeverify/database";

/**
 * Rows written by citation detection are recognisable by their provenance
 * columns (Citation.paragraphId / Reference.position); hand-entered or seed
 * rows leave them null and are never touched by a re-run.
 */
const DETECTED_CITATION = { paragraphId: { not: null } } as const;
const DETECTED_REFERENCE = { position: { not: null } } as const;

const CITATION_ORDER = [
  { position: "asc" as const },
  { createdAt: "asc" as const },
];

export const citationInclude = {
  reference: {
    select: {
      id: true,
      label: true,
      rawText: true,
      authors: true,
      year: true,
      yearSuffix: true,
      title: true,
      doi: true,
    },
  },
  claimLinks: {
    select: { claimId: true, status: true, confidence: true, reason: true },
    orderBy: { claimId: "asc" as const },
  },
} satisfies Prisma.CitationInclude;

export const citationRepository = {
  claimsForDocument: (documentId: string) =>
    prisma.extractedClaim.findMany({
      where: { documentId },
      select: { id: true, paragraphId: true, originalText: true },
    }),

  /**
   * Replaces the previous detection output for a document in one transaction,
   * so a re-run never duplicates citations, references or claim links.
   */
  async replaceDetection(
    documentId: string,
    data: {
      references: Prisma.ReferenceCreateManyInput[];
      citations: Prisma.CitationCreateManyInput[];
      links: Prisma.ClaimCitationCreateManyInput[];
    },
  ) {
    const [removedCitations, removedReferences] = await prisma.$transaction([
      prisma.citation.deleteMany({
        where: { documentId, ...DETECTED_CITATION },
      }),
      prisma.reference.deleteMany({
        where: { documentId, ...DETECTED_REFERENCE },
      }),
      prisma.reference.createMany({ data: data.references }),
      prisma.citation.createMany({ data: data.citations }),
      prisma.claimCitation.createMany({ data: data.links }),
    ]);
    return {
      removedCitations: removedCitations.count,
      removedReferences: removedReferences.count,
    };
  },

  async listForDocument(
    documentId: string,
    { status, page, limit }: { status?: string; page: number; limit: number },
  ) {
    const where = { documentId, ...(status ? { matchStatus: status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.citation.findMany({
        where,
        include: citationInclude,
        orderBy: CITATION_ORDER,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.citation.count({ where }),
    ]);
    return { items, total };
  },

  /** Retrieval fields of the current detected references, keyed by fingerprint. */
  async retrievalStateByFingerprint(documentId: string) {
    const rows = await prisma.reference.findMany({
      where: { documentId, ...DETECTED_REFERENCE, retrievedAt: { not: null } },
      select: {
        fingerprint: true,
        publicationId: true,
        publicationMatchStatus: true,
        publicationMatchConfidence: true,
        publicationMatchMethod: true,
        publicationCandidates: true,
        retrievalError: true,
        retrievedAt: true,
      },
    });
    return new Map(
      rows.flatMap(({ fingerprint, ...state }) =>
        fingerprint ? [[fingerprint, state] as const] : [],
      ),
    );
  },

  listReferences: (documentId: string) =>
    prisma.reference.findMany({
      where: { documentId },
      include: { _count: { select: { citations: true } } },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    }),

  /** Ownership is enforced in the query: other users' citations are simply not found. */
  findForUser: (id: string, userId: string) =>
    prisma.citation.findFirst({
      where: { id, document: { userId } },
      include: citationInclude,
    }),

  findReferences: (documentId: string, ids: string[]) =>
    prisma.reference.findMany({ where: { documentId, id: { in: ids } } }),
};
