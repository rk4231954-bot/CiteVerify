// Validate the environment before anything else is loaded: importing the
// database package creates the Prisma client, so a missing or invalid setting
// must stop the process here with a readable message first.
import "./config/env.ts";

await import("./server.ts");
