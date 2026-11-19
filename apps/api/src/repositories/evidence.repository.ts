import { type Prisma, prisma } from "@citeverify/database";

export type NewEvidenceRow = Prisma.EvidenceCreateManyInput & {
  fingerprint: string;
};
export type NewClaimEvidenceRow = Prisma.ClaimEvidenceCreateManyInput;

const ORDER = [
  { position: "asc" as const },
  { createdAt: "asc" as const },
  { id: "asc" as const },
];

const PUBLICATION_SUMMARY = {
  id: true,
  title: true,
  year: true,
  doi: true,
  journal: true,
} as const;

export const evidenceRepository = {
  listForPublication: (publicationId: string) =>
    prisma.evidence.findMany({ where: { publicationId }, orderBy: ORDER }),

  listForPublications: (publicationIds: string[]) =>
    prisma.evidence.findMany({
      where: { publicationId: { in: publicationIds } },
      orderBy: [{ publicationId: "asc" }, ...ORDER],
    }),

  /** Text keys of the stored evidence, for duplicate prevention. */
  keysForPublication: (publicationId: string) =>
    prisma.evidence.findMany({
      where: { publicationId },
      select: { sourceText: true, fingerprint: true, extractionMethod: true },
    }),

  /**
   * Optionally deletes previously extracted evidence (the given methods only, so
   * manual/legacy rows survive), inserts the new rows and records the attempt —
   * all in one transaction. Deleting evidence cascades to its claim links.
   */
  async replaceAndInsert(
    publicationId: string,
    removeMethods: string[] | null,
    rows: NewEvidenceRow[],
    publication: Prisma.PublicationUpdateInput,
  ) {
    const [removed] = await prisma.$transaction([
      prisma.evidence.deleteMany({
        where: removeMethods
          ? { publicationId, extractionMethod: { in: removeMethods } }
          : { id: { in: [] } },
      }),
      prisma.evidence.createMany({ data: rows }),
      prisma.publication.update({
        where: { id: publicationId },
        data: publication,
      }),
    ]);
    return removed.count;
  },

  publicationsByIds: (ids: string[]) =>
    prisma.publication.findMany({
      where: { id: { in: ids } },
      orderBy: { id: "asc" },
    }),

  /** Publication ids of references (of one document) — only confident matches have one. */
  async publicationIdsForReferences(
    documentId: string,
    referenceIds?: string[],
  ) {
    const refs = await prisma.reference.findMany({
      where: {
        documentId,
        publicationId: { not: null },
        ...(referenceIds ? { id: { in: referenceIds } } : {}),
      },
      select: { publicationId: true },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
    return [
      ...new Set(
        refs.flatMap((r) => (r.publicationId ? [r.publicationId] : [])),
      ),
    ];
  },

  /** Replaces a claim's candidate-evidence links (relevance only, never a verdict). */
  async replaceClaimLinks(claimId: string, rows: NewClaimEvidenceRow[]) {
    await prisma.$transaction([
      prisma.claimEvidence.deleteMany({ where: { claimId } }),
      prisma.claimEvidence.createMany({ data: rows }),
    ]);
  },

  linksForClaim: (claimId: string) =>
    prisma.claimEvidence.findMany({
      where: { claimId },
      include: {
        evidence: { include: { publication: { select: PUBLICATION_SUMMARY } } },
      },
      orderBy: [{ rank: "asc" }, { evidenceId: "asc" }],
    }),
};
