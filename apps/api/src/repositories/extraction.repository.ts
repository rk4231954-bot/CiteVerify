import { prisma } from "@citeverify/database";
import { DocumentStatus } from "@citeverify/shared";

export type SaveExtractionData = {
  status: string;
  result: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  pageCount: number | null;
  paragraphCount: number;
  extractedAt: Date;
};

export const extractionRepository = {
  findByDocumentId: (documentId: string) =>
    prisma.documentExtraction.findUnique({ where: { documentId } }),

  /**
   * Atomically moves a document to PROCESSING unless another extraction is
   * already running. A PROCESSING state older than `staleBefore` is treated as
   * abandoned (e.g. the server restarted mid-extraction) and can be reclaimed.
   * Returns false when the document is busy.
   */
  async claimForProcessing(
    documentId: string,
    staleBefore: Date,
  ): Promise<boolean> {
    const { count } = await prisma.document.updateMany({
      where: {
        id: documentId,
        OR: [
          { status: { not: DocumentStatus.PROCESSING } },
          { updatedAt: { lt: staleBefore } },
        ],
      },
      data: { status: DocumentStatus.PROCESSING },
    });
    return count === 1;
  },

  /** Stores the extraction (replacing any previous one) and sets the document status together. */
  async save(
    documentId: string,
    documentStatus: DocumentStatus,
    data: SaveExtractionData,
  ) {
    const [extraction] = await prisma.$transaction([
      prisma.documentExtraction.upsert({
        where: { documentId },
        create: { documentId, ...data },
        update: data,
      }),
      prisma.document.update({
        where: { id: documentId },
        data: { status: documentStatus },
      }),
    ]);
    return extraction;
  },

  setDocumentStatus: (documentId: string, status: DocumentStatus) =>
    prisma.document.update({ where: { id: documentId }, data: { status } }),
};
