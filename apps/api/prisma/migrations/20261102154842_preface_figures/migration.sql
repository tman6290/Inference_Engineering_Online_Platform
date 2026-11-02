-- AlterTable
ALTER TABLE "Figure" ADD COLUMN     "pageSlug" TEXT,
ALTER COLUMN "chapterNumber" DROP NOT NULL;
