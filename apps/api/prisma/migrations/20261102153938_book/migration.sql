-- CreateTable
CREATE TABLE "BookPage" (
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "BookPage_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "number" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "intro" TEXT NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Section" (
    "number" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "readingMinutes" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "boldTerms" TEXT[],

    CONSTRAINT "Section_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Subsection" (
    "number" TEXT NOT NULL,
    "sectionNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,

    CONSTRAINT "Subsection_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Figure" (
    "number" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "chapterNumber" INTEGER NOT NULL,
    "sectionNumber" TEXT,
    "subsectionNumber" TEXT,

    CONSTRAINT "Figure_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "GlossaryTerm" (
    "slug" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "sectionNumber" TEXT,

    CONSTRAINT "GlossaryTerm_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "Chapter_slug_key" ON "Chapter"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Section_orderIndex_key" ON "Section"("orderIndex");

-- CreateIndex
CREATE INDEX "Subsection_sectionNumber_idx" ON "Subsection"("sectionNumber");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_chapterNumber_fkey" FOREIGN KEY ("chapterNumber") REFERENCES "Chapter"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subsection" ADD CONSTRAINT "Subsection_sectionNumber_fkey" FOREIGN KEY ("sectionNumber") REFERENCES "Section"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Figure" ADD CONSTRAINT "Figure_chapterNumber_fkey" FOREIGN KEY ("chapterNumber") REFERENCES "Chapter"("number") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Figure" ADD CONSTRAINT "Figure_sectionNumber_fkey" FOREIGN KEY ("sectionNumber") REFERENCES "Section"("number") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Figure" ADD CONSTRAINT "Figure_subsectionNumber_fkey" FOREIGN KEY ("subsectionNumber") REFERENCES "Subsection"("number") ON DELETE SET NULL ON UPDATE CASCADE;
