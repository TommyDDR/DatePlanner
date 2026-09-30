-- « Du nouveau » sur « Mes sondages » (décision 034).

-- AlterTable
ALTER TABLE "poll" ADD COLUMN     "activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "owner_seen_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "response" ADD COLUMN     "seen_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "response_user_id_idx" ON "response"("user_id");

-- ---------------------------------------------------------------------------
-- Reprise de l'existant : tout ce qui précède cette version est réputé vu. Sans
-- cela, chaque sondage s'afficherait « du nouveau » au premier passage.
-- ---------------------------------------------------------------------------

-- Heure UTC, comme les dates que Prisma écrit : `CURRENT_TIMESTAMP` suivrait le
-- fuseau de la session.
UPDATE "poll" SET "activity_at" = (now() AT TIME ZONE 'UTC'), "owner_seen_at" = (now() AT TIME ZONE 'UTC');

UPDATE "response" SET "seen_at" = "poll"."activity_at"
FROM "poll"
WHERE "poll"."id" = "response"."poll_id" AND "response"."user_id" IS NOT NULL;
