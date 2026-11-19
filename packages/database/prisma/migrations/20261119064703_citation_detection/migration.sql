-- AlterTable
ALTER TABLE "Citation" ADD COLUMN "charEnd" INTEGER;
ALTER TABLE "Citation" ADD COLUMN "charStart" INTEGER;
ALTER TABLE "Citation" ADD COLUMN "citationKey" TEXT;
ALTER TABLE "Citation" ADD COLUMN "matchCandidates" TEXT;
ALTER TABLE "Citation" ADD COLUMN "matchConfidence" REAL;
ALTER TABLE "Citation" ADD COLUMN "matchStatus" TEXT;
ALTER TABLE "Citation" ADD COLUMN "paragraphId" TEXT;
ALTER TABLE "Citation" ADD COLUMN "section" TEXT;

-- AlterTable
ALTER TABLE "Reference" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "Reference" ADD COLUMN "label" TEXT;
ALTER TABLE "Reference" ADD COLUMN "pageNumber" INTEGER;
ALTER TABLE "Reference" ADD COLUMN "paragraphId" TEXT;
ALTER TABLE "Reference" ADD COLUMN "position" INTEGER;
ALTER TABLE "Reference" ADD COLUMN "venue" TEXT;
ALTER TABLE "Reference" ADD COLUMN "yearSuffix" TEXT;

-- CreateTable
CREATE TABLE "ClaimCitation" (
    "claimId" TEXT NOT NULL,
    "citationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confidence" REAL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("claimId", "citationId"),
    CONSTRAINT "ClaimCitation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExtractedClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimCitation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Preserve existing claim–citation links from the implicit many-to-many table
-- (column A = Citation.id, B = ExtractedClaim.id). Their confidence is unknown.
INSERT INTO "ClaimCitation" ("claimId", "citationId", "status", "reason")
SELECT "B", "A", 'LINKED', 'migrated from implicit relation' FROM "_CitationToExtractedClaim";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "_CitationToExtractedClaim";
PRAGMA foreign_keys=on;

-- CreateIndex
CREATE INDEX "ClaimCitation_citationId_idx" ON "ClaimCitation"("citationId");

-- CreateIndex
CREATE UNIQUE INDEX "Citation_documentId_paragraphId_charStart_citationKey_key" ON "Citation"("documentId", "paragraphId", "charStart", "citationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Reference_documentId_fingerprint_key" ON "Reference"("documentId", "fingerprint");

