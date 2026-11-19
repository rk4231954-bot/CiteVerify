/**
 * Document verification: compares each claim with the evidence of the
 * publications it cites, using @citeverify/verification-engine.
 *
 * Runs synchronously inside the request and records a VerificationJob (status,
 * stage, progress) so the run can be inspected afterwards. Every result is an
 * AUTOMATED assessment and is labelled as such in every response.
 */
import type { Evidence, Publication } from "@citeverify/database";
import {
  evidenceAvailabilitySchema,
  evidenceTypeSchema,
  JobStage,
  JobStatus,
  type Verdict,
} from "@citeverify/shared";
import {
  type ClaimVerification,
  type ClaimVerificationInput,
  createAiStrategy,
  DISCLAIMER,
  type EvidenceInput,
  ruleBasedStrategy,
  storedRationaleSchema,
  storedVerificationDetailsSchema,
  VerificationError,
  type VerificationStrategy,
  verifyClaim,
} from "@citeverify/verification-engine";
import { z } from "zod";
import { claimRepository } from "../repositories/claim.repository.ts";
import { documentRepository } from "../repositories/document.repository.ts";
import {
  type StoredResult,
  verificationRepository,
} from "../repositories/verification.repository.ts";
import { AppError, Errors } from "../utils/errors.ts";
import type {
  VerificationResultsQuery,
  VerifyDocumentBody,
} from "../validators/verification.validator.ts";
import { getVerificationAiProvider } from "./ai-provider.ts";
import { runExtraction } from "./evidence.service.ts";

/** A RUNNING job older than this is treated as abandoned. */
const STALE_RUNNING_MS = 10 * 60 * 1000;
/** Publications whose evidence is extracted on the fly by one run. */
const MAX_EVIDENCE_EXTRACTIONS = 20;

function parseJson<T>(
  value: string | null,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  if (!value) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

async function requireDocument(userId: string, documentId: string) {
  const doc = await documentRepository.findStatusForUser(documentId, userId);
  if (!doc) throw Errors.notFound("Document");
  return doc;
}

type ClaimRow = Awaited<
  ReturnType<typeof verificationRepository.claimsForVerification>
>[number];

const publicationInfo = (p: Publication) => ({
  id: p.id,
  title: p.title,
  year: p.year,
  doi: p.doi,
  journal: p.journal,
  sourceUrl: p.sourceUrl,
  fullTextStatus: p.fullTextStatus,
});

function toEvidenceInput(e: Evidence): EvidenceInput | null {
  const availability = evidenceAvailabilitySchema.safeParse(
    e.evidenceAvailability,
  );
  if (!availability.success) return null;
  const type = evidenceTypeSchema.safeParse(e.evidenceType);
  return {
    id: e.id,
    publicationId: e.publicationId,
    sourceText: e.sourceText,
    normalizedText: e.normalizedText,
    evidenceType: type.success ? type.data : null,
    evidenceAvailability: availability.data,
    section: e.section,
    pageNumber: e.pageNumber,
    sourceUrl: e.sourceUrl,
    confidence: e.confidence,
  };
}

function toInput(
  claim: ClaimRow,
  evidence: EvidenceInput[],
): ClaimVerificationInput {
  return {
    claim: {
      id: claim.id,
      text: claim.originalText,
      normalizedText: claim.normalizedText,
    },
    citations: claim.citationLinks.map((link) => {
      const ref = link.citation.reference;
      return {
        citationId: link.citation.id,
        citationText: link.citation.citationText,
        linkStatus: link.status,
        linkConfidence: link.confidence,
        citationMatchStatus: link.citation.matchStatus,
        referenceId: link.citation.referenceId,
        publicationMatchStatus: ref?.publicationMatchStatus ?? null,
        publicationMatchConfidence: ref?.publicationMatchConfidence ?? null,
        publication: ref?.publication ? publicationInfo(ref.publication) : null,
      };
    }),
    evidence,
  };
}

const evidenceRows = (v: ClaimVerification) =>
  [
    ...v.supportingEvidence,
    ...v.contradictingEvidence,
    ...v.contextEvidence,
  ].map((e, position) => ({
    evidenceId: e.evidenceId,
    publicationId: e.publicationId,
    role: e.role,
    stance: e.stance,
    relevanceScore: e.relevanceScore,
    rationale: JSON.stringify({ flags: e.flags, rationale: e.rationale }),
    sourceText: e.sourceText,
    evidenceType: e.evidenceType,
    evidenceAvailability: e.evidenceAvailability,
    section: e.section,
    pageNumber: e.pageNumber,
    sourceUrl: e.sourceUrl,
    position,
  }));

export function toResultDto(row: StoredResult) {
  const details = parseJson(
    row.details,
    storedVerificationDetailsSchema.nullable(),
    null,
  );
  const evidence = row.evidence.map((e) => {
    const r = parseJson(e.rationale, storedRationaleSchema, {
      flags: [],
      rationale: [],
    });
    return {
      evidenceId: e.evidenceId, // null when the evidence row was later re-extracted
      publicationId: e.publicationId,
      role: e.role,
      stance: e.stance,
      sourceText: e.sourceText,
      evidenceType: e.evidenceType,
      evidenceAvailability: e.evidenceAvailability,
      section: e.section,
      pageNumber: e.pageNumber,
      sourceUrl: e.sourceUrl,
      relevanceScore: e.relevanceScore,
      flags: r.flags,
      rationale: r.rationale,
    };
  });
  return {
    id: row.id,
    jobId: row.verificationJobId,
    claimId: row.claimId,
    claim: {
      originalText: row.claim.originalText,
      pageNumber: row.claim.pageNumber,
      section: row.claim.section,
    },
    verdict: row.verdict,
    /** 0–100: confidence in the automated assessment, not in the science. */
    confidence: Math.round(row.confidence * 100),
    explanation: row.explanation,
    reasonCode: row.reasonCode,
    evidenceSummary: row.evidenceSummary,
    evidenceSource: row.evidenceSource,
    verificationScope: details?.verificationScope ?? row.verificationScope,
    supportingEvidence: evidence.filter((e) => e.role === "SUPPORTING"),
    contradictingEvidence: evidence.filter((e) => e.role === "CONTRADICTING"),
    contextEvidence: evidence.filter(
      (e) => e.role === "CONTEXT" || e.role === "LIMITATION",
    ),
    publications: details?.publications ?? [],
    unresolvedCitations: details?.unresolvedCitations ?? [],
    limitations: parseJson(row.limitations, z.array(z.string()), []),
    humanReview: {
      recommended: row.humanReviewRequired,
      reasons: details?.humanReviewReasons ?? [],
    },
    method: row.method,
    strategy: details?.strategy ?? null,
    rulesApplied: details?.rulesApplied ?? [],
    assessmentType: "AUTOMATED" as const,
    disclaimer: DISCLAIMER,
    createdAt: row.createdAt,
  };
}

type ResultDto = ReturnType<typeof toResultDto>;

function summarize(results: ResultDto[]) {
  const byVerdict: Record<string, number> = {
    SUPPORTED: 0,
    PARTIALLY_SUPPORTED: 0,
    UNSUPPORTED: 0,
    CONTRADICTED: 0,
    OUTDATED: 0,
    MISLEADING_CITATION: 0,
    NEEDS_HUMAN_REVIEW: 0,
  };
  for (const r of results)
    byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;
  return {
    claims: results.length,
    byVerdict: byVerdict as Record<Verdict, number>,
    humanReviewRecommended: results.filter((r) => r.humanReview.recommended)
      .length,
    averageConfidence: results.length
      ? Math.round(
          results.reduce((a, r) => a + r.confidence, 0) / results.length,
        )
      : null,
  };
}

const jobDto = (job: {
  id: string;
  status: string;
  currentStage: string | null;
  method: string | null;
  totalClaims: number | null;
  processedClaims: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) => ({
  id: job.id,
  status: job.status,
  stage: job.currentStage,
  method: job.method,
  totalClaims: job.totalClaims,
  processedClaims: job.processedClaims,
  errorMessage: job.errorMessage,
  startedAt: job.startedAt,
  completedAt: job.completedAt,
  createdAt: job.createdAt,
});

function strategyFor(
  method: VerifyDocumentBody["method"],
): VerificationStrategy {
  if (method === "RULE_BASED") return ruleBasedStrategy;
  const provider = getVerificationAiProvider();
  if (!provider) throw Errors.aiProviderNotConfigured("verification");
  return createAiStrategy(provider);
}

export const verificationService = {
  async verifyDocument(
    userId: string,
    documentId: string,
    body: VerifyDocumentBody,
  ) {
    const doc = await requireDocument(userId, documentId);
    const strategy = strategyFor(body.method); // 501 before any job is recorded

    const claims = await verificationRepository.claimsForVerification(
      doc.id,
      body.claimIds,
    );
    if (body.claimIds) {
      const found = new Set(claims.map((c) => c.id));
      const missing = body.claimIds.filter((id) => !found.has(id));
      if (missing.length)
        throw Errors.badRequest(
          `Unknown claim id(s) for this document: ${missing.join(", ")}`,
        );
    }
    if (!claims.length)
      throw Errors.conflict(
        "Document has no extracted claims; run POST /api/documents/:id/extract-claims first",
      );

    const job = await verificationRepository.startJob(
      doc.id,
      { method: body.method, totalClaims: claims.length },
      new Date(Date.now() - STALE_RUNNING_MS),
    );
    if (!job)
      throw Errors.conflict(
        "A verification run for this document is already in progress",
      );

    const warnings: string[] = [];
    try {
      // ── Sources: evidence for every cited, resolved publication ──────
      await verificationRepository.updateJob(job.id, {
        currentStage: JobStage.RETRIEVING_SOURCES,
      });
      const publications = new Map<string, Publication>();
      for (const c of claims)
        for (const l of c.citationLinks) {
          const p = l.citation.reference?.publication;
          if (p) publications.set(p.id, p);
        }
      if (body.extractMissingEvidence) {
        const missing = [...publications.values()].filter(
          (p) => !p.evidenceExtractedAt,
        );
        if (missing.length > MAX_EVIDENCE_EXTRACTIONS)
          warnings.push(
            `Evidence was extracted for ${MAX_EVIDENCE_EXTRACTIONS} of ${missing.length} publications without evidence; the rest were verified without evidence`,
          );
        for (const pub of missing.slice(0, MAX_EVIDENCE_EXTRACTIONS)) {
          try {
            const r = await runExtraction(pub, {
              fullText: true,
              method: "RULE_BASED",
              replace: false,
            });
            if (r.verificationScope !== "FULL")
              warnings.push(
                `"${pub.title}": ${r.fullText.reason || "full text not available"}; abstract only`,
              );
          } catch (error) {
            if (!(error instanceof AppError)) throw error;
            warnings.push(
              `"${pub.title}": evidence extraction failed (${error.message})`,
            );
          }
        }
      }
      const evidence = (
        await verificationRepository.evidenceForPublications([
          ...publications.keys(),
        ])
      )
        .map(toEvidenceInput)
        .filter((e) => e !== null);
      // Re-read publications: extraction updated their full-text status.
      const fresh = await verificationRepository.claimsForVerification(
        doc.id,
        body.claimIds,
      );

      // ── Verify ────────────────────────────────────────────────────────
      await verificationRepository.updateJob(job.id, {
        currentStage: JobStage.VERIFYING,
      });
      const results: ResultDto[] = [];
      for (const [i, claim] of fresh.entries()) {
        const v = await verifyClaim(toInput(claim, evidence), { strategy });
        const row = await verificationRepository.createResult({
          claimId: claim.id,
          verificationJobId: job.id,
          verdict: v.verdict,
          confidence: v.confidence / 100,
          explanation: v.explanation,
          evidenceSummary: `${v.supportingEvidence.length} supporting, ${v.contradictingEvidence.length} contradicting passage(s); evidence: ${v.evidenceSource}`,
          humanReviewRequired: v.humanReview.recommended,
          reasonCode: v.reasonCode,
          evidenceSource: v.evidenceSource,
          verificationScope: v.verificationScope,
          limitations: JSON.stringify(v.limitations),
          details: JSON.stringify(
            storedVerificationDetailsSchema.parse({
              reasonCode: v.reasonCode,
              publications: v.publications,
              unresolvedCitations: v.unresolvedCitations,
              verificationScope: v.verificationScope,
              humanReviewReasons: v.humanReview.reasons,
              strategy: v.strategy,
              rulesApplied: v.rulesApplied,
            }),
          ),
          method: v.method,
          evidence: { create: evidenceRows(v) },
        });
        results.push(toResultDto(row));
        await verificationRepository.updateJob(job.id, {
          processedClaims: i + 1,
        });
      }

      const done = await verificationRepository.updateJob(job.id, {
        status: JobStatus.COMPLETED,
        completedAt: new Date(),
      });
      return {
        job: jobDto(done),
        summary: summarize(results),
        results,
        warnings,
        assessmentType: "AUTOMATED" as const,
        disclaimer: DISCLAIMER,
      };
    } catch (error) {
      await verificationRepository.updateJob(job.id, {
        status: JobStatus.FAILED,
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Verification failed",
        completedAt: new Date(),
      });
      if (error instanceof VerificationError)
        throw error.code === "AI_PROVIDER_NOT_CONFIGURED"
          ? Errors.aiProviderNotConfigured("verification")
          : Errors.aiProviderFailed(error.message);
      throw error;
    }
  },

  async resultsForDocument(
    userId: string,
    documentId: string,
    query: VerificationResultsQuery,
  ) {
    const doc = await requireDocument(userId, documentId);
    const job = query.jobId
      ? await verificationRepository.jobForDocument(query.jobId, doc.id)
      : await verificationRepository.latestCompletedJob(doc.id);
    if (query.jobId && !job) throw Errors.notFound("Verification job");
    if (!job)
      return {
        job: null,
        summary: summarize([]),
        results: [],
        reason:
          "The document has not been verified yet; run POST /api/documents/:id/verify",
        assessmentType: "AUTOMATED" as const,
        disclaimer: DISCLAIMER,
      };
    const all = (await verificationRepository.resultsForJob(job.id)).map(
      toResultDto,
    );
    const results = all.filter(
      (r) =>
        (!query.verdict || r.verdict === query.verdict) &&
        (query.humanReview === undefined ||
          r.humanReview.recommended === query.humanReview),
    );
    return {
      job: jobDto(job),
      summary: summarize(all),
      total: results.length,
      results,
      reason: null,
      assessmentType: "AUTOMATED" as const,
      disclaimer: DISCLAIMER,
    };
  },

  async status(userId: string, documentId: string) {
    const doc = await requireDocument(userId, documentId);
    const [latest, completed] = await Promise.all([
      verificationRepository.latestJob(doc.id),
      verificationRepository.latestCompletedJob(doc.id),
    ]);
    const stale =
      latest?.status === JobStatus.RUNNING &&
      (latest.startedAt?.getTime() ?? 0) < Date.now() - STALE_RUNNING_MS;
    return {
      documentId: doc.id,
      verified: completed !== null,
      latestJob: latest ? { ...jobDto(latest), stale } : null,
      latestCompletedJobId: completed?.id ?? null,
      lastVerifiedAt: completed?.completedAt ?? null,
    };
  },

  async forClaim(userId: string, claimId: string) {
    const claim = await claimRepository.findForUser(claimId, userId);
    if (!claim) throw Errors.notFound("Claim");
    const rows = await verificationRepository.resultsForClaim(claim.id);
    const latest =
      rows.find((r) => r.job.status === JobStatus.COMPLETED) ?? null;
    return {
      claimId: claim.id,
      claim: {
        originalText: claim.originalText,
        pageNumber: claim.pageNumber,
        section: claim.section,
      },
      verified: latest !== null,
      result: latest ? toResultDto(latest) : null,
      history: rows.map((r) => ({
        resultId: r.id,
        jobId: r.verificationJobId,
        jobStatus: r.job.status,
        verdict: r.verdict,
        confidence: Math.round(r.confidence * 100),
        humanReviewRequired: r.humanReviewRequired,
        createdAt: r.createdAt,
      })),
      assessmentType: "AUTOMATED" as const,
      disclaimer: DISCLAIMER,
    };
  },
};
