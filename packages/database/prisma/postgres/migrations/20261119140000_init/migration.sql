-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "filePath" TEXT,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "pageCount" INTEGER,
    "paragraphCount" INTEGER NOT NULL DEFAULT 0,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractedClaim" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "normalizedText" TEXT,
    "pageNumber" INTEGER,
    "section" TEXT,
    "confidence" DOUBLE PRECISION,
    "category" TEXT,
    "characteristics" TEXT,
    "rationale" TEXT,
    "extractionMethod" TEXT,
    "paragraphId" TEXT,
    "position" INTEGER,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtractedClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "citationText" TEXT NOT NULL,
    "citationType" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "referenceId" TEXT,
    "citationKey" TEXT,
    "paragraphId" TEXT,
    "section" TEXT,
    "charStart" INTEGER,
    "charEnd" INTEGER,
    "position" INTEGER,
    "matchStatus" TEXT,
    "matchConfidence" DOUBLE PRECISION,
    "matchCandidates" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimCitation" (
    "claimId" TEXT NOT NULL,
    "citationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimCitation_pkey" PRIMARY KEY ("claimId","citationId")
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "title" TEXT,
    "authors" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "publicationId" TEXT,
    "label" TEXT,
    "venue" TEXT,
    "yearSuffix" TEXT,
    "position" INTEGER,
    "paragraphId" TEXT,
    "pageNumber" INTEGER,
    "fingerprint" TEXT,
    "publicationMatchStatus" TEXT,
    "publicationMatchConfidence" DOUBLE PRECISION,
    "publicationMatchMethod" TEXT,
    "publicationCandidates" TEXT,
    "retrievalError" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "abstract" TEXT,
    "sourceUrl" TEXT,
    "publisher" TEXT,
    "openAccess" BOOLEAN NOT NULL DEFAULT false,
    "retrievalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "openAlexId" TEXT,
    "journal" TEXT,
    "provider" TEXT,
    "openAccessStatus" TEXT,
    "openAccessUrl" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "fullTextStatus" TEXT,
    "evidenceExtractedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "normalizedText" TEXT,
    "pageNumber" INTEGER,
    "section" TEXT,
    "evidenceType" TEXT,
    "evidenceAvailability" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "extractionMethod" TEXT,
    "confidence" DOUBLE PRECISION,
    "details" TEXT,
    "position" INTEGER,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimEvidence" (
    "claimId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "matchedTerms" TEXT,
    "method" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimEvidence_pkey" PRIMARY KEY ("claimId","evidenceId")
);

-- CreateTable
CREATE TABLE "VerificationJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentStage" TEXT,
    "errorMessage" TEXT,
    "method" TEXT,
    "totalClaims" INTEGER,
    "processedClaims" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "verificationJobId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceSummary" TEXT,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reasonCode" TEXT,
    "evidenceSource" TEXT,
    "verificationScope" TEXT,
    "limitations" TEXT,
    "details" TEXT,
    "method" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEvidence" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "publicationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "stance" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION,
    "rationale" TEXT,
    "sourceText" TEXT NOT NULL,
    "evidenceType" TEXT,
    "evidenceAvailability" TEXT NOT NULL,
    "section" TEXT,
    "pageNumber" INTEGER,
    "sourceUrl" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationReport" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "verificationJobId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reportPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentExtraction_documentId_key" ON "DocumentExtraction"("documentId");

-- CreateIndex
CREATE INDEX "ExtractedClaim_documentId_idx" ON "ExtractedClaim"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractedClaim_documentId_fingerprint_key" ON "ExtractedClaim"("documentId", "fingerprint");

-- CreateIndex
CREATE INDEX "Citation_documentId_idx" ON "Citation"("documentId");

-- CreateIndex
CREATE INDEX "Citation_referenceId_idx" ON "Citation"("referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "Citation_documentId_paragraphId_charStart_citationKey_key" ON "Citation"("documentId", "paragraphId", "charStart", "citationKey");

-- CreateIndex
CREATE INDEX "ClaimCitation_citationId_idx" ON "ClaimCitation"("citationId");

-- CreateIndex
CREATE INDEX "Reference_documentId_idx" ON "Reference"("documentId");

-- CreateIndex
CREATE INDEX "Reference_publicationId_idx" ON "Reference"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Reference_documentId_fingerprint_key" ON "Reference"("documentId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_doi_key" ON "Publication"("doi");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_openAlexId_key" ON "Publication"("openAlexId");

-- CreateIndex
CREATE INDEX "Evidence_publicationId_idx" ON "Evidence"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Evidence_publicationId_fingerprint_key" ON "Evidence"("publicationId", "fingerprint");

-- CreateIndex
CREATE INDEX "ClaimEvidence_evidenceId_idx" ON "ClaimEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "VerificationJob_documentId_idx" ON "VerificationJob"("documentId");

-- CreateIndex
CREATE INDEX "VerificationJob_status_idx" ON "VerificationJob"("status");

-- CreateIndex
CREATE INDEX "VerificationResult_verificationJobId_idx" ON "VerificationResult"("verificationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_claimId_verificationJobId_key" ON "VerificationResult"("claimId", "verificationJobId");

-- CreateIndex
CREATE INDEX "VerificationEvidence_resultId_idx" ON "VerificationEvidence"("resultId");

-- CreateIndex
CREATE INDEX "VerificationEvidence_evidenceId_idx" ON "VerificationEvidence"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationReport_verificationJobId_key" ON "VerificationReport"("verificationJobId");

-- CreateIndex
CREATE INDEX "VerificationReport_documentId_idx" ON "VerificationReport"("documentId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractedClaim" ADD CONSTRAINT "ExtractedClaim_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Citation" ADD CONSTRAINT "Citation_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCitation" ADD CONSTRAINT "ClaimCitation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExtractedClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimCitation" ADD CONSTRAINT "ClaimCitation_citationId_fkey" FOREIGN KEY ("citationId") REFERENCES "Citation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reference" ADD CONSTRAINT "Reference_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExtractedClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationJob" ADD CONSTRAINT "VerificationJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExtractedClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationResult" ADD CONSTRAINT "VerificationResult_verificationJobId_fkey" FOREIGN KEY ("verificationJobId") REFERENCES "VerificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "VerificationResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEvidence" ADD CONSTRAINT "VerificationEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "Evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationReport" ADD CONSTRAINT "VerificationReport_verificationJobId_fkey" FOREIGN KEY ("verificationJobId") REFERENCES "VerificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

