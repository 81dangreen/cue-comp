-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "tableIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
