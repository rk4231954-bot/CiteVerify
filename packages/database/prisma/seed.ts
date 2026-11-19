/**
 * Development seed — SYNTHETIC DEMONSTRATION DATA ONLY.
 *
 * Every record below is invented for local development. The "paper",
 * "publications", authors, DOIs, and findings do not exist and must not be
 * presented as real research. DOIs use the 10.5555 prefix, which is reserved
 * for examples and never resolves to a real work.
 *
 * Idempotent: re-running removes the previous demo records first.
 */
import {
  CitationType,
  DocumentStatus,
  EvidenceAvailability,
  EvidenceExtractionMethod,
  EvidenceType,
  JobStage,
  JobStatus,
  RetrievalStatus,
  Verdict,
} from "@citeverify/shared";
import {
  prisma,
  resolveDatabaseProvider,
  serializeAuthors,
} from "../src/index.ts";

// The demo account has a published password, so it must never reach a shared
// database. The seed only runs against local SQLite outside production.
if (
  process.env.NODE_ENV === "production" ||
  resolveDatabaseProvider() !== "sqlite"
) {
  console.error(
    "[seed] Refusing to seed: demo data is for local SQLite development only.",
  );
  process.exit(1);
}

const DEMO_EMAIL = "demo@citeverify.local";
const DEMO_PASSWORD = "demo-password";
const DOI_A = "10.5555/synthetic-demo.0001";
const DOI_B = "10.5555/synthetic-demo.0002";

async function main() {
  // Clear previous demo data (documents and everything under them cascade from the user).
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
  await prisma.publication.deleteMany({
    where: { doi: { in: [DOI_A, DOI_B] } },
  });

  const user = await prisma.user.create({
    data: {
      name: "Demo User (synthetic)",
      email: DEMO_EMAIL,
      passwordHash: await Bun.password.hash(DEMO_PASSWORD),
    },
  });

  // Publications the demo document cites. A has a matching finding; B contradicts the claim.
  const pubA = await prisma.publication.create({
    data: {
      title: "[SYNTHETIC] A Fictional Cohort Study of Walking and Sleep",
      authors: serializeAuthors(["Example, A.", "Placeholder, B."]),
      year: 2021,
      doi: DOI_A,
      abstract:
        "SYNTHETIC DEMO ABSTRACT. In this invented cohort, participants who walked 30 minutes daily reported modestly better sleep quality scores than non-walkers.",
      publisher: "Synthetic Demo Press",
      openAccess: true,
      retrievalStatus: RetrievalStatus.RETRIEVED,
      evidence: {
        create: {
          sourceText:
            "SYNTHETIC: Daily walkers showed a modest improvement in self-reported sleep quality (invented result).",
          section: "Abstract",
          evidenceType: EvidenceType.ABSTRACT_FINDING,
          evidenceAvailability: EvidenceAvailability.ABSTRACT,
          extractionMethod: EvidenceExtractionMethod.MANUAL,
        },
      },
    },
  });
  const pubB = await prisma.publication.create({
    data: {
      title: "[SYNTHETIC] An Imaginary Trial on Exercise Timing",
      authors: serializeAuthors(["Sample, C."]),
      year: 2019,
      doi: DOI_B,
      abstract:
        "SYNTHETIC DEMO ABSTRACT. This invented trial found no measurable effect of evening exercise on time to fall asleep.",
      publisher: "Synthetic Demo Press",
      openAccess: false,
      retrievalStatus: RetrievalStatus.RETRIEVED,
      evidence: {
        create: {
          sourceText:
            "SYNTHETIC: No significant difference in sleep onset latency was observed between groups (invented result).",
          section: "Results",
          pageNumber: 4,
          evidenceType: EvidenceType.EXPERIMENTAL_RESULT,
          evidenceAvailability: EvidenceAvailability.FULL_TEXT,
          extractionMethod: EvidenceExtractionMethod.MANUAL,
        },
      },
    },
  });

  const document = await prisma.document.create({
    data: {
      userId: user.id,
      title: "[SYNTHETIC DEMO] Walking and Sleep — Example Manuscript",
      originalFilename: "synthetic-demo-manuscript.pdf",
      filePath: "uploads/demo/synthetic-demo-manuscript.pdf",
      fileType: "application/pdf",
      fileSize: 245_760,
      status: DocumentStatus.COMPLETED,
    },
  });

  // Bibliography. The third entry was never matched to a publication.
  const [refA, refB, refC] = await Promise.all(
    [
      {
        rawText: `[1] Example A, Placeholder B. A Fictional Cohort Study of Walking and Sleep. 2021. doi:${DOI_A}`,
        title: pubA.title,
        authors: pubA.authors,
        year: 2021,
        doi: DOI_A,
        publicationId: pubA.id,
      },
      {
        rawText: `[2] Sample C. An Imaginary Trial on Exercise Timing. 2019. doi:${DOI_B}`,
        title: pubB.title,
        authors: pubB.authors,
        year: 2019,
        doi: DOI_B,
        publicationId: pubB.id,
      },
      {
        rawText: "[3] Nobody N. An Unfindable Synthetic Report. 2010.",
        title: "An Unfindable Synthetic Report",
        authors: serializeAuthors(["Nobody, N."]),
        year: 2010,
        doi: null,
        publicationId: null,
      },
    ].map((data) =>
      prisma.reference.create({ data: { documentId: document.id, ...data } }),
    ),
  );
  if (!refA || !refB || !refC) throw new Error("failed to create references");

  const citation = (text: string, referenceId: string, pageNumber: number) =>
    prisma.citation.create({
      data: {
        documentId: document.id,
        citationText: text,
        citationType: CitationType.NUMERIC,
        pageNumber,
        referenceId,
        citationKey: text.replace(/[[\]]/g, ""),
        matchStatus: "MATCHED",
        matchConfidence: 1,
      },
    });
  const [cit1, cit2, cit3] = await Promise.all([
    citation("[1]", refA.id, 2),
    citation("[2]", refB.id, 3),
    citation("[3]", refC.id, 3),
  ]);
  if (!cit1 || !cit2 || !cit3) throw new Error("failed to create citations");

  const claim = (
    originalText: string,
    pageNumber: number,
    citationIds: string[],
  ) =>
    prisma.extractedClaim.create({
      data: {
        documentId: document.id,
        originalText,
        normalizedText: originalText.toLowerCase(),
        pageNumber,
        section: "Introduction",
        confidence: 0.9,
        category: "SCIENTIFIC_FACT",
        extractionMethod: "MANUAL", // hand-written synthetic seed claim
        citationLinks: {
          create: citationIds.map((citationId) => ({
            citationId,
            status: "LINKED",
            confidence: 1,
            reason: "synthetic seed link",
          })),
        },
      },
    });
  const claim1 = await claim(
    "Daily walking modestly improves self-reported sleep quality [1].",
    2,
    [cit1.id],
  );
  const claim2 = await claim(
    "Evening exercise substantially shortens the time needed to fall asleep [2].",
    3,
    [cit2.id],
  );
  const claim3 = await claim(
    "Most adults sleep better after any amount of physical activity [1][3].",
    3,
    [cit1.id, cit3.id],
  );

  const now = new Date();
  const job = await prisma.verificationJob.create({
    data: {
      documentId: document.id,
      status: JobStatus.COMPLETED,
      currentStage: JobStage.REPORTING,
      startedAt: new Date(now.getTime() - 60_000),
      completedAt: now,
      results: {
        create: [
          {
            claimId: claim1.id,
            verdict: Verdict.SUPPORTED,
            explanation:
              "SYNTHETIC: The cited (fictional) cohort reports the same modest improvement.",
            confidence: 0.86,
            evidenceSummary: "Matches abstract of synthetic publication [1].",
          },
          {
            claimId: claim2.id,
            verdict: Verdict.CONTRADICTED,
            explanation:
              "SYNTHETIC: The cited (fictional) trial found no effect on sleep onset.",
            confidence: 0.78,
            evidenceSummary:
              "Results section of synthetic publication [2] reports no significant difference.",
          },
          {
            claimId: claim3.id,
            verdict: Verdict.NEEDS_HUMAN_REVIEW,
            explanation:
              "SYNTHETIC: Claim overgeneralises [1], and source [3] could not be retrieved.",
            confidence: 0.42,
            humanReviewRequired: true,
          },
        ],
      },
    },
  });

  await prisma.verificationReport.create({
    data: {
      documentId: document.id,
      verificationJobId: job.id,
      summary:
        "SYNTHETIC DEMO REPORT: 3 claims checked — 1 supported, 1 contradicted, 1 needs human review.",
    },
  });

  console.log("Seeded SYNTHETIC demo data:");
  console.log(`  user      ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`  document  ${document.id}`);
  console.log(
    "  3 claims, 3 citations, 3 references, 2 publications, 1 job, 3 results, 1 report",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
