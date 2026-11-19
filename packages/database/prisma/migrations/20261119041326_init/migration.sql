-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtractedClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "normalizedText" TEXT,
    "pageNumber" INTEGER,
    "section" TEXT,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtractedClaim_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Citation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "citationText" TEXT NOT NULL,
    "citationType" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "referenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Citation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Citation_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "Reference" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "title" TEXT,
    "authors" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "publicationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reference_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "authors" TEXT,
    "year" INTEGER,
    "doi" TEXT,
    "abstract" TEXT,
    "sourceUrl" TEXT,
    "publisher" TEXT,
    "openAccess" BOOLEAN NOT NULL DEFAULT false,
    "retrievalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "publicationId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "section" TEXT,
    "evidenceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evidence_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "currentStage" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VerificationJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "claimId" TEXT NOT NULL,
    "verificationJobId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "evidenceSummary" TEXT,
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationResult_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "ExtractedClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VerificationResult_verificationJobId_fkey" FOREIGN KEY ("verificationJobId") REFERENCES "VerificationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "verificationJobId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reportPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VerificationReport_verificationJobId_fkey" FOREIGN KEY ("verificationJobId") REFERENCES "VerificationJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_CitationToExtractedClaim" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_CitationToExtractedClaim_A_fkey" FOREIGN KEY ("A") REFERENCES "Citation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_CitationToExtractedClaim_B_fkey" FOREIGN KEY ("B") REFERENCES "ExtractedClaim" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "ExtractedClaim_documentId_idx" ON "ExtractedClaim"("documentId");

-- CreateIndex
CREATE INDEX "Citation_documentId_idx" ON "Citation"("documentId");

-- CreateIndex
CREATE INDEX "Citation_referenceId_idx" ON "Citation"("referenceId");

-- CreateIndex
CREATE INDEX "Reference_documentId_idx" ON "Reference"("documentId");

-- CreateIndex
CREATE INDEX "Reference_publicationId_idx" ON "Reference"("publicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_doi_key" ON "Publication"("doi");

-- CreateIndex
CREATE INDEX "Evidence_publicationId_idx" ON "Evidence"("publicationId");

-- CreateIndex
CREATE INDEX "VerificationJob_documentId_idx" ON "VerificationJob"("documentId");

-- CreateIndex
CREATE INDEX "VerificationJob_status_idx" ON "VerificationJob"("status");

-- CreateIndex
CREATE INDEX "VerificationResult_verificationJobId_idx" ON "VerificationResult"("verificationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationResult_claimId_verificationJobId_key" ON "VerificationResult"("claimId", "verificationJobId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationReport_verificationJobId_key" ON "VerificationReport"("verificationJobId");

-- CreateIndex
CREATE INDEX "VerificationReport_documentId_idx" ON "VerificationReport"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "_CitationToExtractedClaim_AB_unique" ON "_CitationToExtractedClaim"("A", "B");

-- CreateIndex
CREATE INDEX "_CitationToExtractedClaim_B_index" ON "_CitationToExtractedClaim"("B");
