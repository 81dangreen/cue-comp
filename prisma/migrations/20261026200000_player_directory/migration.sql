-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_organizationId_fkey";

-- DropIndex
DROP INDEX "Player_organizationId_lastName_idx";

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactPhone" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "homeClub" TEXT,
ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "directoryAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Player_lastName_firstName_idx" ON "Player"("lastName", "firstName");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing accounts are the platform's first organisers: make them directory admins.
UPDATE "User" SET "directoryAdmin" = true;

-- Organisers keep the contact details people gave when self-registering for their comps.
UPDATE "Entry" e
SET "contactEmail" = p."email", "contactPhone" = p."phone"
FROM "Player" p
WHERE e."playerId" = p."id" AND e."status" = 'REGISTERED';
