/** SYNTHETIC fixtures: every study, title, number and URL here is fictional. */
import type {
  CitationLink,
  ClaimVerificationInput,
  EvidenceInput,
  PublicationInfo,
} from "../src/index.ts";

export function publication(
  id: string,
  overrides: Partial<PublicationInfo> = {},
): PublicationInfo {
  return {
    id,
    title:
      "Aerobic exercise and blood pressure in a fictional trial of older adults",
    year: 2020,
    doi: `10.5555/fictional.${id}`,
    journal: "Journal of Made-up Cardiology",
    sourceUrl: `https://doi.org/10.5555/fictional.${id}`,
    fullTextStatus: "AVAILABLE",
    ...overrides,
  };
}

export function citation(
  pub: PublicationInfo | null,
  overrides: Partial<CitationLink> = {},
): CitationLink {
  return {
    citationId: `cit-${pub?.id ?? "x"}`,
    citationText: `[${pub?.id ?? "?"}]`,
    linkStatus: "LINKED",
    linkConfidence: 0.95,
    citationMatchStatus: "MATCHED",
    referenceId: `ref-${pub?.id ?? "x"}`,
    publicationMatchStatus: pub ? "MATCHED" : "NOT_FOUND",
    publicationMatchConfidence: pub ? 0.99 : null,
    publication: pub,
    ...overrides,
  };
}

let n = 0;
export function evidence(
  publicationId: string,
  sourceText: string,
  overrides: Partial<EvidenceInput> = {},
): EvidenceInput {
  const availability = overrides.evidenceAvailability ?? "FULL_TEXT";
  return {
    id: `ev-${++n}`,
    publicationId,
    sourceText,
    normalizedText: null,
    evidenceType: "STATISTICAL_RESULT",
    evidenceAvailability: availability,
    section: availability === "ABSTRACT" ? "Abstract" : "Results",
    pageNumber: availability === "ABSTRACT" ? null : 4,
    sourceUrl:
      availability === "ABSTRACT"
        ? null
        : `https://repo.example.org/${publicationId}.pdf`,
    confidence: 0.8,
    ...overrides,
  };
}

export const CLAIM_TEXT =
  "Aerobic exercise reduces systolic blood pressure in older adults [1].";

export const METHODS = (pub: string, extra: Partial<EvidenceInput> = {}) =>
  evidence(
    pub,
    "We randomly assigned 240 adults aged 65 years or older to supervised aerobic exercise or usual care for 12 weeks.",
    { evidenceType: "METHODOLOGY", section: "Methods", ...extra },
  );

export function input(
  citations: CitationLink[],
  ev: EvidenceInput[],
  text = CLAIM_TEXT,
): ClaimVerificationInput {
  return { claim: { id: "claim-1", text }, citations, evidence: ev };
}
