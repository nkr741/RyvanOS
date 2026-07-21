-- AlterTable
ALTER TABLE "OutreachStep" ADD COLUMN "resendMessageId" TEXT;

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "resendMessageId" TEXT,
    "workItemId" TEXT,
    "outreachStepId" TEXT,
    "prospectId" TEXT,
    "contactId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "fromName" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "bounceReason" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_resendMessageId_key" ON "EmailLog"("resendMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_outreachStepId_key" ON "EmailLog"("outreachStepId");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_outreachStepId_fkey" FOREIGN KEY ("outreachStepId") REFERENCES "OutreachStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
