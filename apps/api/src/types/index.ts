import type { Document, User } from "@citeverify/database";

/** Hono environment: values set on the context by middleware. */
export type AppEnv = {
  Variables: {
    userId: string;
  };
};

/** Public user shape — never includes passwordHash. */
export type PublicUser = Pick<
  User,
  "id" | "name" | "email" | "createdAt" | "updatedAt"
>;

/** Public document shape — the on-disk path stays server-side. */
export type PublicDocument = Omit<Document, "filePath" | "userId">;

export type JwtClaims = { sub: string; exp: number; iat: number };
