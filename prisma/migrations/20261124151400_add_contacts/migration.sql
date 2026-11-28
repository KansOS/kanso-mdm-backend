-- CreateEnum
CREATE TYPE "ContactTrustLevel" AS ENUM ('connu', 'en_validation', 'inconnu');

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "trustLevel" "ContactTrustLevel" NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contact_spaceId_idx" ON "Contact"("spaceId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
