-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "frameMinutes" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN "calledAt" TIMESTAMP(3);
