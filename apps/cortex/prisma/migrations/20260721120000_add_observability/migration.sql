-- AlterTable: Add cost/latency columns to Mission
ALTER TABLE "Mission" ADD COLUMN "totalCostUsd" DOUBLE PRECISION;
ALTER TABLE "Mission" ADD COLUMN "inputTokens" INTEGER;
ALTER TABLE "Mission" ADD COLUMN "outputTokens" INTEGER;
ALTER TABLE "Mission" ADD COLUMN "durationMs" INTEGER;

-- CreateTable: LlmUsageLog
CREATE TABLE "LlmUsageLog" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "correlationId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LlmUsageLog_correlationId_idx" ON "LlmUsageLog"("correlationId");
CREATE INDEX "LlmUsageLog_createdAt_idx" ON "LlmUsageLog"("createdAt");
