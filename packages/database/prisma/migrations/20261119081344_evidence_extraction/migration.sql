-- AlterTable
ALTER TABLE "Publication" ADD COLUMN "evidenceExtractedAt" DATETIME;
ALTER TABLE "Publication" ADD COLUMN "fullTextStatus" TEXT;

-- CreateTable
CREATE TABLE "ClaimEvidence" (
    "claimId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "relevanceScore" REAL NOT NULL,
    "rank" INTEGER NOT NULL,
    "matchedTerms" TEXT,
    "method" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("claimId", "evidenceId"),
    CONSTRAINT "ClaimEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExtractedClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClaimEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "normalizedText" TEXT,
    "pageNumber" INTEGER,
    "section" TEXT,
    "evidenceType" TEXT,
    "evidenceAvailability" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "extractionMethod" TEXT,
    "confidence" REAL,
    "details" TEXT,
    "position" INTEGER,
    "fingerprint" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- The old "evidenceType" column held availability (ABSTRACT | FULL_TEXT | METADATA):
-- move it to "evidenceAvailability". Existing rows were never classified into an
-- evidence category, so their new "evidenceType" stays NULL rather than being guessed.
INSERT INTO "new_Evidence" ("createdAt", "evidenceAvailability", "evidenceType", "id", "pageNumber", "publicationId", "section", "sourceText", "sourceUrl") SELECT "createdAt", "evidenceType", NULL, "id", "pageNumber", "publicationId", "section", "sourceText", "sourceUrl" FROM "Evidence";
DROP TABLE "Evidence";
ALTER TABLE "new_Evidence" RENAME TO "Evidence";
CREATE INDEX "Evidence_publicationId_idx" ON "Evidence"("publicationId");
CREATE UNIQUE INDEX "Evidence_publicationId_fingerprint_key" ON "Evidence"("publicationId", "fingerprint");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ClaimEvidence_evidenceId_idx" ON "ClaimEvidence"("evidenceId");

