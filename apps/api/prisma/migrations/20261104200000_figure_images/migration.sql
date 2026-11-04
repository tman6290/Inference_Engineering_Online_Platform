-- CreateTable
CREATE TABLE "FigureImage" (
    "figureNumber" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "FigureImage_pkey" PRIMARY KEY ("figureNumber")
);

-- AddForeignKey
ALTER TABLE "FigureImage" ADD CONSTRAINT "FigureImage_figureNumber_fkey" FOREIGN KEY ("figureNumber") REFERENCES "Figure"("number") ON DELETE CASCADE ON UPDATE CASCADE;

