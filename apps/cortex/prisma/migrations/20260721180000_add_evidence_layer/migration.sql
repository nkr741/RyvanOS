-- CreateTable: Evidence (Company Intelligence Mission)
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "collector" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 70,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "missionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Evidence_prospectId_collector_idx" ON "Evidence"("prospectId", "collector");
CREATE INDEX "Evidence_prospectId_type_idx" ON "Evidence"("prospectId", "type");

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: Make DiscoverySignal.candidateId optional
-- Evidence-backed signals may not originate from a CompanyCandidate
ALTER TABLE "DiscoverySignal" ALTER COLUMN "candidateId" DROP NOT NULL;
