-- AlterTable
ALTER TABLE "Publication" ADD COLUMN "journal" TEXT;
ALTER TABLE "Publication" ADD COLUMN "openAccessStatus" TEXT;
ALTER TABLE "Publication" ADD COLUMN "openAccessUrl" TEXT;
ALTER TABLE "Publication" ADD COLUMN "openAlexId" TEXT;
ALTER TABLE "Publication" ADD COLUMN "provider" TEXT;
ALTER TABLE "Publication" ADD COLUMN "retrievedAt" DATETIME;

-- AlterTable
ALTER TABLE "Reference" ADD COLUMN "publicationCandidates" TEXT;
ALTER TABLE "Reference" ADD COLUMN "publicationMatchConfidence" REAL;
ALTER TABLE "Reference" ADD COLUMN "publicationMatchMethod" TEXT;
ALTER TABLE "Reference" ADD COLUMN "publicationMatchStatus" TEXT;
ALTER TABLE "Reference" ADD COLUMN "retrievalError" TEXT;
ALTER TABLE "Reference" ADD COLUMN "retrievedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "Publication_openAlexId_key" ON "Publication"("openAlexId");

