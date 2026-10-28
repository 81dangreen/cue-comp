-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "partnerId" TEXT,
ADD COLUMN     "teamName" TEXT,
ADD COLUMN     "tiebreak" INTEGER;

-- AlterTable
ALTER TABLE "Frame" ADD COLUMN     "player1Id" TEXT,
ADD COLUMN     "player2Id" TEXT;

-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "tableId" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "lineup" JSONB;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "entryType" TEXT NOT NULL DEFAULT 'SINGLES',
ADD COLUMN     "groupFinish" TEXT NOT NULL DEFAULT 'FIRST_TO',
ADD COLUMN     "handicapMatrix" JSONB,
ADD COLUMN     "koFinish" TEXT NOT NULL DEFAULT 'FIRST_TO',
ADD COLUMN     "lineupMode" TEXT NOT NULL DEFAULT 'RANDOM',
ADD COLUMN     "matchFrames" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "plateQualifiers" INTEGER,
ADD COLUMN     "pointsDraw" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pointsLoss" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pointsWin" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "tablePerGroup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tiebreakers" TEXT[] DEFAULT ARRAY['FRAME_DIFF', 'FRAMES_FOR', 'HEAD_TO_HEAD']::TEXT[];

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

