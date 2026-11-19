import { existsSync } from "node:fs";
import path from "node:path";

/** Walks up from `start` to the monorepo root (the directory containing turbo.json). */
export function findRepoRoot(start = process.cwd()): string {
  let dir = path.resolve(start);
  while (!existsSync(path.join(dir, "turbo.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
  return dir;
}
