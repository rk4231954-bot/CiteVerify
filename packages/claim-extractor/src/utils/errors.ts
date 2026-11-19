export type ClaimExtractionErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_ERROR"
  | "INVALID_INPUT";

export class ClaimExtractionError extends Error {
  constructor(
    readonly code: ClaimExtractionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ClaimExtractionError";
  }
}
