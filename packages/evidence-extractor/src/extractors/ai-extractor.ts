/**
 * AI-assisted evidence extraction through a provider-independent interface.
 *
 * The provider only PROPOSES passages. A proposal is accepted only if it is
 * schema-valid, names a real passage, and its sentence is a verbatim quote of
 * that passage — so an AI can never introduce text, numbers or findings that
 * are not in the source. Details (statistics, sample sizes) are still
 * extracted by the rule-based code from the quoted text.
 */

import { roundConfidence } from "@citeverify/claim-extractor";
import { EvidenceExtractionMethod, EvidenceType } from "@citeverify/shared";
import { aiEvidenceCandidateSchema } from "../schemas/evidence.schema.ts";
import type {
  EvidenceAiProvider,
  ExtractedEvidence,
  SourcePassage,
} from "../types/evidence.types.ts";
import { EvidenceExtractionError } from "../utils/errors.ts";
import { buildEvidence } from "./rule-based-extractor.ts";

export async function extractEvidenceWithAi(
  publicationId: string,
  passages: readonly SourcePassage[],
  provider: EvidenceAiProvider,
  createdAt = new Date().toISOString(),
): Promise<{ evidence: ExtractedEvidence[]; warnings: string[] }> {
  let proposals: unknown[];
  try {
    proposals = await provider.extractEvidence({ publicationId, passages });
  } catch (error) {
    throw new EvidenceExtractionError(
      "AI_PROVIDER_ERROR",
      `AI provider "${provider.name}" failed: ${(error as Error).message}`,
      { cause: error },
    );
  }

  const warnings: string[] = [];
  const evidence: ExtractedEvidence[] = [];
  for (const [i, raw] of proposals.entries()) {
    const parsed = aiEvidenceCandidateSchema.safeParse(raw);
    if (!parsed.success) {
      warnings.push(`AI proposal #${i + 1} rejected: invalid shape`);
      continue;
    }
    const c = parsed.data;
    // Several passages can share an id (segments of one structured abstract).
    const sentence = c.sentence.trim();
    const passage = passages.find(
      (p) => p.id === c.passageId && p.text.includes(sentence),
    );
    if (!passage) {
      warnings.push(
        `AI proposal #${i + 1} rejected: not a verbatim quote of passage "${c.passageId}"`,
      );
      continue;
    }
    const at = passage.text.indexOf(sentence);
    let type = c.evidenceType;
    // Never let an abstract sentence pass as a full-text experimental result.
    if (
      passage.availability === "ABSTRACT" &&
      type === EvidenceType.EXPERIMENTAL_RESULT
    )
      type = EvidenceType.ABSTRACT_FINDING;
    evidence.push(
      buildEvidence(
        publicationId,
        {
          passage,
          text: sentence,
          start: passage.offset + at,
          end: passage.offset + at + sentence.length,
        },
        {
          evidenceType: type,
          confidence: roundConfidence(c.confidence ?? 0.5),
          signals: [`proposed by AI provider "${provider.name}"`],
        },
        EvidenceExtractionMethod.AI,
        createdAt,
      ),
    );
  }
  return { evidence, warnings };
}
