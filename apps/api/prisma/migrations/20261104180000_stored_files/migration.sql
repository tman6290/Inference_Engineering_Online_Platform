-- CreateTable
CREATE TABLE "TeachBackAudio" (
    "teachBackId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "TeachBackAudio_pkey" PRIMARY KEY ("teachBackId")
);

-- CreateTable
CREATE TABLE "SubmissionFileBlob" (
    "fileId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "SubmissionFileBlob_pkey" PRIMARY KEY ("fileId")
);

-- AddForeignKey
ALTER TABLE "TeachBackAudio" ADD CONSTRAINT "TeachBackAudio_teachBackId_fkey" FOREIGN KEY ("teachBackId") REFERENCES "TeachBack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionFileBlob" ADD CONSTRAINT "SubmissionFileBlob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "SubmissionFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

