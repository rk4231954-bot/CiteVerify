import { prisma } from "@citeverify/database";

/** Columns safe to return to clients (no filePath / userId). */
const publicDocumentSelect = {
  id: true,
  title: true,
  originalFilename: true,
  fileType: true,
  fileSize: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type CreateDocumentData = {
  userId: string;
  title: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  filePath?: string | null;
};

export const documentRepository = {
  create: (data: CreateDocumentData) =>
    prisma.document.create({ data, select: publicDocumentSelect }),

  async listForUser(userId: string, skip: number, take: number) {
    const where = { userId };
    const [items, total] = await prisma.$transaction([
      prisma.document.findMany({
        where,
        select: publicDocumentSelect,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.document.count({ where }),
    ]);
    return { items, total };
  },

  /** Scoped by owner: another user's document is indistinguishable from a missing one. */
  findDetailForUser: (id: string, userId: string) =>
    prisma.document.findFirst({
      where: { id, userId },
      select: {
        ...publicDocumentSelect,
        _count: { select: { claims: true, citations: true, references: true } },
        jobs: {
          select: {
            id: true,
            status: true,
            currentStage: true,
            createdAt: true,
            completedAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),

  findFilePathForUser: (id: string, userId: string) =>
    prisma.document.findFirst({
      where: { id, userId },
      select: { id: true, filePath: true },
    }),

  delete: (id: string) => prisma.document.delete({ where: { id } }),
};
