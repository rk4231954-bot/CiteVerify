import { prisma, resolveDatabaseProvider } from "@citeverify/database";
import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { healthRepository } from "./repositories/health.repository.ts";
import { storageService } from "./services/storage.service.ts";
import { safeErrorMessage } from "./utils/log.ts";

// Fail fast when the upload directory is missing or read-only (e.g. a volume
// that is not mounted) instead of failing on the first upload.
try {
  await storageService.checkWritable();
} catch (error) {
  console.error(
    `[api] upload directory ${env.UPLOAD_DIR} is not writable: ${safeErrorMessage(error)}`,
  );
  process.exit(1);
}

if (!(await healthRepository.ping())) {
  console.warn(
    "[api] WARNING: database is not reachable — run `bun run db:migrate:deploy`",
  );
}

const server = Bun.serve({
  hostname: env.HOST,
  port: env.API_PORT,
  // Hono streams and limits upload bodies itself; this is a hard ceiling above MAX_FILE_SIZE.
  maxRequestBodySize: env.MAX_FILE_SIZE + 1024 * 1024,
  fetch: createApp().fetch,
});

console.log(
  `[api] ${env.NODE_ENV} · listening on ${env.HOST}:${server.port} (/api) · database: ${resolveDatabaseProvider()} · uploads: ${env.UPLOAD_DIR} · CORS: ${env.FRONTEND_URL}`,
);

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`[api] ${signal} received, shutting down`);
  await server.stop();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
