import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { env } from "./config/env.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { apiRoutes } from "./routes/index.ts";
import type { AppEnv } from "./types/index.ts";
import { fail } from "./utils/response.ts";

export function createApp() {
  const app = new Hono<AppEnv>();

  if (env.NODE_ENV !== "test") app.use(logger());
  app.use(secureHeaders());
  app.use(
    "/api/*",
    cors({
      origin: env.FRONTEND_URL,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );

  app.route("/api", apiRoutes);

  app.notFound((c) =>
    fail(c, 404, "NOT_FOUND", `Route ${c.req.method} ${c.req.path} not found`),
  );
  app.onError(errorHandler);

  return app;
}

export type AppType = ReturnType<typeof createApp>;
