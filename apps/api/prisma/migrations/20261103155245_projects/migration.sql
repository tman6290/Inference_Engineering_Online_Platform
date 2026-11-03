-- CreateTable
CREATE TABLE "Project" (
    "slug" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "unlockAfterSection" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "brief" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectSlug" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "commitSha" TEXT,
    "noteToGrader" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "failure" TEXT,
    "artifacts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "log" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CheckResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Critique" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "json" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "costUsd" DOUBLE PRECISION,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Critique_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_number_key" ON "Project"("number");

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_userId_projectSlug_version_key" ON "Submission"("userId", "projectSlug", "version");

-- CreateIndex
CREATE UNIQUE INDEX "SubmissionFile_submissionId_name_key" ON "SubmissionFile"("submissionId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CheckResult_submissionId_checkId_key" ON "CheckResult"("submissionId", "checkId");

-- CreateIndex
CREATE UNIQUE INDEX "Critique_submissionId_key" ON "Critique"("submissionId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_projectSlug_fkey" FOREIGN KEY ("projectSlug") REFERENCES "Project"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFile" ADD CONSTRAINT "SubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckResult" ADD CONSTRAINT "CheckResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Critique" ADD CONSTRAINT "Critique_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
