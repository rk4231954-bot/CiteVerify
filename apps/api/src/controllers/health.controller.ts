import { createFactory } from "hono/factory";
import { healthRepository } from "../repositories/health.repository.ts";
import { ok } from "../utils/response.ts";

const factory = createFactory();
const startedAt = Date.now();

export const getHealth = factory.createHandlers(async (c) => {
  const dbConnected = await healthRepository.ping();
  return ok(
    c,
    {
      status: dbConnected ? "ok" : "degraded",
      database: dbConnected ? "connected" : "disconnected",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    },
    dbConnected ? 200 : 503,
  );
});
