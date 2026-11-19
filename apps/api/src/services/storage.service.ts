import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.ts";

/**
 * File storage under UPLOAD_DIR. Paths stored in the DB are relative to it.
 *
 * Development uses storage/uploads in the repo. In production UPLOAD_DIR must
 * be on persistent storage (a Railway volume), because a container's own
 * filesystem is replaced on every deploy; env.ts refuses to start otherwise.
 */
export const storageService = {
  ensureUploadDir: () => mkdir(env.UPLOAD_DIR, { recursive: true }),

  /** Creates UPLOAD_DIR if needed and proves it accepts writes (fails fast on a read-only or missing mount). */
  async checkWritable(): Promise<void> {
    await this.ensureUploadDir();
    const probe = path.join(env.UPLOAD_DIR, `.write-check-${process.pid}`);
    await Bun.write(probe, "ok");
    await unlink(probe);
  },

  /** Saves the file under a fresh UUID name and returns its relative path. */
  async save(file: File, extension: string): Promise<string> {
    await this.ensureUploadDir();
    const relativePath = `${crypto.randomUUID()}${extension}`;
    await Bun.write(this.resolve(relativePath), file);
    return relativePath;
  },

  /** Reads a stored file, or returns null if it no longer exists. */
  async read(relativePath: string): Promise<Uint8Array | null> {
    const file = Bun.file(this.resolve(relativePath));
    return (await file.exists())
      ? new Uint8Array(await file.arrayBuffer())
      : null;
  },

  /** Best-effort delete; a missing file is not an error. */
  async remove(relativePath: string): Promise<void> {
    try {
      await unlink(this.resolve(relativePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  },

  resolve(relativePath: string): string {
    const full = path.resolve(env.UPLOAD_DIR, relativePath);
    if (!full.startsWith(env.UPLOAD_DIR + path.sep)) {
      throw new Error(`Refusing path outside upload dir: ${relativePath}`);
    }
    return full;
  },
};
