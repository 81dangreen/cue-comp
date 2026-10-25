-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "rank" INTEGER;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "handicap1" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "handicap2" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "target1" INTEGER,
ADD COLUMN     "target2" INTEGER;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "handicapStarts" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "handicapStyle" TEXT;

-- CreateTable
CREATE TABLE "PlayerRank" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "PlayerRank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRank_playerId_discipline_key" ON "PlayerRank"("playerId", "discipline");

-- AddForeignKey
ALTER TABLE "PlayerRank" ADD CONSTRAINT "PlayerRank_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

