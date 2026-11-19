export type EvidenceExtractionErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_ERROR";

export class EvidenceExtractionError extends Error {
  constructor(
    readonly code: EvidenceExtractionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EvidenceExtractionError";
  }
}
