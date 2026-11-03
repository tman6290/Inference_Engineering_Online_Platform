-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "sectionNumbers" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "longestUptime" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StudyDay" (
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "readingMinutes" INTEGER NOT NULL,
    "sectionsRead" INTEGER NOT NULL,
    "answersGraded" INTEGER NOT NULL,
    "projectEvents" INTEGER NOT NULL,
    "intensity" INTEGER NOT NULL,

    CONSTRAINT "StudyDay_pkey" PRIMARY KEY ("userId","date")
);
