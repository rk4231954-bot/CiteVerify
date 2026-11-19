import { Prisma } from "@citeverify/database";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { env } from "../config/env.ts";
import { AppError, Errors } from "../utils/errors.ts";
import { logError } from "../utils/log.ts";
import { fail } from "../utils/response.ts";

const send = (c: Context, e: AppError) =>
  fail(c, e.status, e.code, e.message, e.details);

/** Single place that turns any thrown error into the standard error envelope. */
export function errorHandler(error: Error, c: Context) {
  if (error instanceof AppError) return send(c, error);

  if (error instanceof HTTPException) {
    // e.g. malformed JSON body from hono's validator
    return fail(
      c,
      error.status,
      error.status === 400 ? "BAD_REQUEST" : "HTTP_ERROR",
      error.message,
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002")
      return send(c, Errors.conflict("Resource already exists"));
    if (error.code === "P2025") return send(c, Errors.notFound());
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    /ConnectionFailed|SQLITE_(CANTOPEN|BUSY|LOCKED|IOERR)|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|Connection terminated|too many clients|the database system is (starting up|shutting down)|P1001|P1002|P1017/.test(
      error.message,
    )
  ) {
    logError("database error", error, {
      method: c.req.method,
      path: c.req.path,
    });
    return send(c, Errors.databaseUnavailable());
  }

  logError("unhandled error", error, {
    method: c.req.method,
    path: c.req.path,
  });
  const message =
    env.NODE_ENV === "production" ? "Internal server error" : error.message;
  return fail(c, 500, "INTERNAL_ERROR", message);
}
