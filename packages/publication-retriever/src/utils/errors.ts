import type { PublicationProvider } from "@citeverify/shared";
import type {
  ProviderErrorKind,
  ProviderFailure,
} from "../types/publication.types.ts";

export class ProviderError extends Error {
  constructor(
    readonly provider: PublicationProvider,
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  toFailure(): ProviderFailure {
    return {
      provider: this.provider,
      kind: this.kind,
      message: this.message,
      ...(this.status ? { status: this.status } : {}),
    };
  }
}
