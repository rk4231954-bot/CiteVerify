import { prisma } from "@citeverify/database";
import { createApp } from "./app.ts";
import { env } from "./config/env.ts";
import { healthRepository } from "./repositories/health.repository.ts";
import { storageService } from "./services/storage.service.ts";

await storageService.ensureUploadDir();

if (!(await healthRepository.ping())) {
  console.warn(
    "[api] WARNING: database is not reachable — run `bun run db:migrate:deploy`",
  );
}

const server = Bun.serve({
  port: env.API_PORT,
  fetch: createApp().fetch,
});

console.log(`[api] listening on http://localhost:${server.port}/api`);

const shutdown = async () => {
  await server.stop();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
