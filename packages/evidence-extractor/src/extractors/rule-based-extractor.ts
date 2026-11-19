/**
 * Rule-based evidence extraction from source passages: sentence splitting,
 * classification and verbatim detail extraction. Sentences are copied
 * exactly; normalisation only produces a separate matching text.
 */
import {
  claimFingerprint,
  normalizeClaimText,
  splitSentences,
} from "@citeverify/claim-extractor";
import { EvidenceExtractionMethod } from "@citeverify/shared";
import { classifyEvidenceSentence } from "../classifiers/evidence-classifier.ts";
import type {
  ExtractedEvidence,
  SourcePassage,
} from "../types/evidence.types.ts";
import { extractDetails } from "../utils/details.ts";

export type SentenceUnit = {
  passage: SourcePassage;
  text: string;
  start: number;
  end: number;
};

/** Sentences of a passage, with offsets relative to the ORIGINAL passage (abstract or paragraph). */
export function passageSentences(passage: SourcePassage): SentenceUnit[] {
  return splitSentences(passage.text).map((s) => ({
    passage,
    text: s.text,
    start: passage.offset + s.start,
    end: passage.offset + s.end,
  }));
}

export function buildEvidence(
  publicationId: string,
  unit: SentenceUnit,
  classification: {
    evidenceType: ExtractedEvidence["evidenceType"];
    confidence: number;
    signals: string[];
  },
  method: ExtractedEvidence["extractionMethod"],
  createdAt: string,
): ExtractedEvidence {
  const normalizedText = normalizeClaimText(unit.text);
  return {
    id: crypto.randomUUID(),
    publicationId,
    sourceText: unit.text,
    normalizedText,
    evidenceType: classification.evidenceType,
    section: unit.passage.section,
    pageNumber: unit.passage.pageNumber,
    sourceUrl: unit.passage.sourceUrl,
    extractionMethod: method,
    evidenceAvailability: unit.passage.availability,
    confidence: classification.confidence,
    details: {
      ...extractDetails(unit.text),
      location: {
        passageId: unit.passage.id,
        charStart: unit.start,
        charEnd: unit.end,
        abstractLabel: unit.passage.abstractLabel,
      },
      signals: classification.signals,
    },
    position: 0, // assigned by the processor
    fingerprint: claimFingerprint(normalizedText),
    createdAt,
  };
}

export function extractEvidenceRuleBased(
  publicationId: string,
  passages: readonly SourcePassage[],
  createdAt = new Date().toISOString(),
): { evidence: ExtractedEvidence[]; sentencesConsidered: number } {
  const evidence: ExtractedEvidence[] = [];
  let sentencesConsidered = 0;
  for (const passage of passages) {
    for (const unit of passageSentences(passage)) {
      sentencesConsidered++;
      const classification = classifyEvidenceSentence(unit.text, {
        sectionKind: passage.sectionKind,
        section: passage.abstractLabel
          ? `${passage.section ?? "Abstract"} › ${passage.abstractLabel}`
          : passage.section,
        availability: passage.availability,
      });
      if (classification)
        evidence.push(
          buildEvidence(
            publicationId,
            unit,
            classification,
            EvidenceExtractionMethod.RULE_BASED,
            createdAt,
          ),
        );
    }
  }
  return { evidence, sentencesConsidered };
}
