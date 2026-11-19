import { createMiddleware } from "hono/factory";
import { tokenService } from "../services/token.service.ts";
import type { AppEnv } from "../types/index.ts";
import { Errors } from "../utils/errors.ts";

/** Requires `Authorization: Bearer <jwt>` and sets `userId` on the context. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1]) throw Errors.unauthorized();
  c.set("userId", await tokenService.verify(match[1]));
  await next();
});
