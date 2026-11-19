-- AlterTable
ALTER TABLE "VerificationJob" ADD COLUMN "method" TEXT;
ALTER TABLE "VerificationJob" ADD COLUMN "processedClaims" INTEGER;
ALTER TABLE "VerificationJob" ADD COLUMN "totalClaims" INTEGER;

-- AlterTable
ALTER TABLE "VerificationResult" ADD COLUMN "details" TEXT;
ALTER TABLE "VerificationResult" ADD COLUMN "evidenceSource" TEXT;
ALTER TABLE "VerificationResult" ADD COLUMN "limitations" TEXT;
ALTER TABLE "VerificationResult" ADD COLUMN "method" TEXT;
ALTER TABLE "VerificationResult" ADD COLUMN "reasonCode" TEXT;
ALTER TABLE "VerificationResult" ADD COLUMN "verificationScope" TEXT;

-- CreateTable
CREATE TABLE "VerificationEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resultId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "publicationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "stance" TEXT NOT NULL,
    "relevanceScore" REAL,
    "rationale" TEXT,
    "sourceText" TEXT NOT NULL,
    "evidenceType" TEXT,
    "evidenceAvailability" TEXT NOT NULL,
    "section" TEXT,
    "pageNumber" INTEGER,
    "sourceUrl" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationEvidence_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "VerificationResult" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VerificationEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VerificationEvidence_resultId_idx" ON "VerificationEvidence"("resultId");

-- CreateIndex
CREATE INDEX "VerificationEvidence_evidenceId_idx" ON "VerificationEvidence"("evidenceId");

