export type VerificationErrorCode =
  | "AI_PROVIDER_NOT_CONFIGURED"
  | "AI_PROVIDER_ERROR";

export class VerificationError extends Error {
  constructor(
    readonly code: VerificationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VerificationError";
  }
}
