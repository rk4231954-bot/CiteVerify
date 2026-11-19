import { type Prisma, prisma } from "@citeverify/database";
import { JobStatus } from "@citeverify/shared";

const RESULT_INCLUDE = {
  evidence: { orderBy: { position: "asc" } },
  claim: {
    select: {
      id: true,
      originalText: true,
      pageNumber: true,
      section: true,
      position: true,
    },
  },
} satisfies Prisma.VerificationResultInclude;

export type StoredResult = Prisma.VerificationResultGetPayload<{
  include: typeof RESULT_INCLUDE;
}>;

export const verificationRepository = {
  /** Claims with everything needed to resolve their citations to publications. */
  claimsForVerification: (documentId: string, claimIds?: string[]) =>
    prisma.extractedClaim.findMany({
      where: { documentId, ...(claimIds ? { id: { in: claimIds } } : {}) },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        citationLinks: {
          include: {
            citation: {
              select: {
                id: true,
                citationText: true,
                matchStatus: true,
                referenceId: true,
                position: true,
                reference: {
                  select: {
                    id: true,
                    publicationMatchStatus: true,
                    publicationMatchConfidence: true,
                    publication: true,
                  },
                },
              },
            },
          },
          orderBy: { citation: { position: "asc" } },
        },
      },
    }),

  evidenceForPublications: (publicationIds: string[]) =>
    prisma.evidence.findMany({
      where: { publicationId: { in: publicationIds } },
      orderBy: [
        { publicationId: "asc" },
        { position: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    }),

  /**
   * Starts a run unless one is already RUNNING (and not abandoned) for the
   * document — checked and created in one transaction.
   */
  startJob: (
    documentId: string,
    data: { method: string; totalClaims: number },
    staleBefore: Date,
  ) =>
    prisma.$transaction(async (tx) => {
      const active = await tx.verificationJob.findFirst({
        where: {
          documentId,
          status: JobStatus.RUNNING,
          startedAt: { gt: staleBefore },
        },
        select: { id: true },
      });
      if (active) return null;
      // Abandoned runs are closed so the status never shows two RUNNING jobs.
      await tx.verificationJob.updateMany({
        where: {
          documentId,
          status: { in: [JobStatus.RUNNING, JobStatus.PENDING] },
        },
        data: {
          status: JobStatus.FAILED,
          errorMessage: "Abandoned (no progress)",
          completedAt: new Date(),
        },
      });
      return tx.verificationJob.create({
        data: {
          documentId,
          status: JobStatus.RUNNING,
          method: data.method,
          totalClaims: data.totalClaims,
          processedClaims: 0,
          startedAt: new Date(),
        },
      });
    }),

  updateJob: (id: string, data: Prisma.VerificationJobUpdateInput) =>
    prisma.verificationJob.update({ where: { id }, data }),

  createResult: (data: Prisma.VerificationResultUncheckedCreateInput) =>
    prisma.verificationResult.create({ data, include: RESULT_INCLUDE }),

  latestJob: (documentId: string) =>
    prisma.verificationJob.findFirst({
      where: { documentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),

  latestCompletedJob: (documentId: string) =>
    prisma.verificationJob.findFirst({
      where: { documentId, status: JobStatus.COMPLETED },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    }),

  jobForDocument: (id: string, documentId: string) =>
    prisma.verificationJob.findFirst({ where: { id, documentId } }),

  resultsForJob: (verificationJobId: string) =>
    prisma.verificationResult.findMany({
      where: { verificationJobId },
      include: RESULT_INCLUDE,
      orderBy: [{ claim: { position: "asc" } }, { createdAt: "asc" }],
    }),

  resultsForClaim: (claimId: string) =>
    prisma.verificationResult.findMany({
      where: { claimId },
      include: {
        ...RESULT_INCLUDE,
        job: { select: { status: true, completedAt: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
};
