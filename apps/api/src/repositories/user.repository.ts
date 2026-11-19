import { prisma } from "@citeverify/database";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const userRepository = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  findPublicById: (id: string) =>
    prisma.user.findUnique({ where: { id }, select: publicUserSelect }),

  create: (data: { name: string; email: string; passwordHash: string }) =>
    prisma.user.create({ data, select: publicUserSelect }),
};
