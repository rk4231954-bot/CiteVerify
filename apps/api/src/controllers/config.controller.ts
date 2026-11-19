import { createFactory } from "hono/factory";
import { env } from "../config/env.ts";
import {
  getAiProvider,
  getVerificationAiProvider,
} from "../services/ai-provider.ts";
import { getEvidenceAiProvider } from "../services/evidence-providers.ts";
import { SUPPORTED_FILES } from "../utils/file-type.ts";
import { ok } from "../utils/response.ts";

const factory = createFactory();

/**
 * Public, read-only client configuration: limits the frontend must validate
 * against and which optional capabilities this server actually provides
 * (so a client never offers something that would fail). No secrets.
 */
export const getConfig = factory.createHandlers((c) =>
  ok(c, {
    upload: {
      maxBytes: env.MAX_FILE_SIZE,
      extensions: Object.keys(SUPPORTED_FILES),
      mimeTypes: Object.values(SUPPORTED_FILES).map((f) => f.mimeType),
    },
    features: {
      aiClaimExtraction: getAiProvider() !== null,
      aiEvidenceExtraction: getEvidenceAiProvider() !== null,
      aiVerification: getVerificationAiProvider() !== null,
      openAccessFullText: env.EVIDENCE_FULLTEXT_ENABLED,
      /** Server-side report generation / PDF export is not implemented. */
      reportExport: false,
    },
  }),
);
