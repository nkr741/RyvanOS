-- CreateTable
CREATE TABLE "BdeLocation" (
    "id" TEXT NOT NULL,
    "bdeId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "battery" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BdeLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BdeLocation_bdeId_createdAt_idx" ON "BdeLocation"("bdeId", "createdAt");

-- CreateIndex
CREATE INDEX "BdeLocation_createdAt_idx" ON "BdeLocation"("createdAt");

-- AddForeignKey
ALTER TABLE "BdeLocation" ADD CONSTRAINT "BdeLocation_bdeId_fkey" FOREIGN KEY ("bdeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
