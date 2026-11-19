import { prisma } from "@citeverify/database";

export type NewClaimRow = {
  id: string;
  documentId: string;
  originalText: string;
  normalizedText: string;
  category: string;
  characteristics: string;
  rationale: string;
  extractionMethod: string;
  pageNumber: number | null;
  section: string | null;
  paragraphId: string;
  position: number;
  confidence: number;
  fingerprint: string;
  createdAt: Date;
};

const ORDER = [{ position: "asc" as const }, { createdAt: "asc" as const }];

export const claimRepository = {
  /** Text keys of a document's existing claims, for duplicate prevention. */
  findKeysForDocument: (documentId: string) =>
    prisma.extractedClaim.findMany({
      where: { documentId },
      select: { originalText: true, fingerprint: true, extractionMethod: true },
    }),

  /** Optionally deletes one method's previous claims, then inserts the new ones atomically. */
  async replaceAndInsert(
    documentId: string,
    removeMethod: string | null,
    rows: NewClaimRow[],
  ) {
    const [removed] = await prisma.$transaction([
      prisma.extractedClaim.deleteMany({
        where: removeMethod
          ? { documentId, extractionMethod: removeMethod }
          : { id: { in: [] } },
      }),
      prisma.extractedClaim.createMany({ data: rows }),
    ]);
    return removed.count;
  },

  findByIds: (ids: string[]) =>
    prisma.extractedClaim.findMany({
      where: { id: { in: ids } },
      orderBy: ORDER,
    }),

  async listForDocument(
    documentId: string,
    {
      category,
      page,
      limit,
    }: { category?: string; page: number; limit: number },
  ) {
    const where = { documentId, ...(category ? { category } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.extractedClaim.findMany({
        where,
        orderBy: ORDER,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.extractedClaim.count({ where }),
    ]);
    return { items, total };
  },

  /** Ownership is enforced in the query: other users' claims are simply not found. */
  findForUser: (id: string, userId: string) =>
    prisma.extractedClaim.findFirst({
      where: { id, document: { userId } },
      include: {
        citationLinks: {
          include: {
            citation: {
              select: {
                id: true,
                citationText: true,
                citationKey: true,
                matchStatus: true,
                matchConfidence: true,
                referenceId: true,
              },
            },
          },
          orderBy: { citation: { position: "asc" } },
        },
      },
    }),

  async deleteForUser(id: string, userId: string) {
    const { count } = await prisma.extractedClaim.deleteMany({
      where: { id, document: { userId } },
    });
    return count === 1;
  },
};
