import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  validation: (details: unknown, message = "Request validation failed") =>
    new AppError(400, "VALIDATION_ERROR", message, details),
  badRequest: (message: string) => new AppError(400, "BAD_REQUEST", message),
  unauthorized: (message = "Authentication required") =>
    new AppError(401, "UNAUTHORIZED", message),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password"),
  notFound: (resource = "Resource") =>
    new AppError(404, "NOT_FOUND", `${resource} not found`),
  conflict: (message: string) => new AppError(409, "CONFLICT", message),
  fileTooLarge: (maxBytes: number) =>
    new AppError(
      413,
      "FILE_TOO_LARGE",
      `File exceeds the maximum size of ${maxBytes} bytes`,
    ),
  unsupportedFile: (message = "Only PDF and DOCX files are supported") =>
    new AppError(415, "UNSUPPORTED_FILE_TYPE", message),
  extractionFailed: (message: string, reason: string) =>
    new AppError(422, "EXTRACTION_FAILED", message, { reason }),
  aiProviderNotConfigured: () =>
    new AppError(
      501,
      "AI_PROVIDER_NOT_CONFIGURED",
      "AI claim extraction is not configured on this server; use method RULE_BASED",
    ),
  aiProviderFailed: (message: string) =>
    new AppError(502, "AI_PROVIDER_ERROR", message),
  databaseUnavailable: () =>
    new AppError(503, "DATABASE_UNAVAILABLE", "Database is unavailable"),
};
