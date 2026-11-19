-- AlterTable
ALTER TABLE "ExtractedClaim" ADD COLUMN "category" TEXT;
ALTER TABLE "ExtractedClaim" ADD COLUMN "characteristics" TEXT;
ALTER TABLE "ExtractedClaim" ADD COLUMN "extractionMethod" TEXT;
ALTER TABLE "ExtractedClaim" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "ExtractedClaim" ADD COLUMN "paragraphId" TEXT;
ALTER TABLE "ExtractedClaim" ADD COLUMN "position" INTEGER;
ALTER TABLE "ExtractedClaim" ADD COLUMN "rationale" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedClaim_documentId_fingerprint_key" ON "ExtractedClaim"("documentId", "fingerprint");

