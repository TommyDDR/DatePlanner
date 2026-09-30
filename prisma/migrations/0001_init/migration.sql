-- CreateEnum
CREATE TYPE "poll_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "email_template" AS ENUM ('PASSWORD_RESET', 'OWNER_DIGEST', 'RETAINED_DAY', 'INACTIVITY_WARNING');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('PENDING', 'SENT', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "email_proved_at" TIMESTAMP(3),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inactivity_warned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll" (
    "id" UUID NOT NULL,
    "public_id" TEXT NOT NULL,
    "owner_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "poll_status" NOT NULL DEFAULT 'OPEN',
    "retained_day_id" UUID,
    "require_account" BOOLEAN NOT NULL DEFAULT false,
    "notify_owner" BOOLEAN NOT NULL DEFAULT true,
    "owner_digest_sent_at" TIMESTAMP(3),
    "owner_digest_cursor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_day" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "day" DATE NOT NULL,

    CONSTRAINT "poll_day_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "user_id" UUID,
    "pseudonym" TEXT,
    "device_token_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote" (
    "response_id" UUID NOT NULL,
    "poll_day_id" UUID NOT NULL,

    CONSTRAINT "vote_pkey" PRIMARY KEY ("response_id","poll_day_id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "template" "email_template" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "poll_id" UUID,
    "status" "email_status" NOT NULL DEFAULT 'PENDING',
    "send_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hit" (
    "id" BIGSERIAL NOT NULL,
    "bucket" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_run" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_run_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_google_id_key" ON "user"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_hash_key" ON "session"("token_hash");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_token_user_id_idx" ON "password_reset_token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_public_id_key" ON "poll"("public_id");

-- CreateIndex
CREATE INDEX "poll_owner_id_created_at_idx" ON "poll"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "poll_day_poll_id_day_key" ON "poll_day"("poll_id", "day");

-- CreateIndex
CREATE UNIQUE INDEX "poll_day_poll_id_id_key" ON "poll_day"("poll_id", "id");

-- CreateIndex
CREATE INDEX "response_poll_id_created_at_idx" ON "response"("poll_id", "created_at");

-- CreateIndex
CREATE INDEX "vote_poll_day_id_idx" ON "vote"("poll_day_id");

-- CreateIndex
CREATE INDEX "email_outbox_status_send_after_idx" ON "email_outbox"("status", "send_after");

-- CreateIndex
CREATE INDEX "email_outbox_poll_id_idx" ON "email_outbox"("poll_id");

-- CreateIndex
CREATE INDEX "rate_limit_hit_bucket_key_at_idx" ON "rate_limit_hit"("bucket", "key", "at");

-- CreateIndex
CREATE INDEX "rate_limit_hit_at_idx" ON "rate_limit_hit"("at");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll" ADD CONSTRAINT "poll_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_day" ADD CONSTRAINT "poll_day_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response" ADD CONSTRAINT "response_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response" ADD CONSTRAINT "response_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote" ADD CONSTRAINT "vote_poll_day_id_fkey" FOREIGN KEY ("poll_day_id") REFERENCES "poll_day"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Contraintes que Prisma ne sait pas déclarer (data-model.md).
-- ---------------------------------------------------------------------------

-- Une date retenue n'existe que sur un sondage clos.
ALTER TABLE "poll" ADD CONSTRAINT "poll_retained_day_only_when_closed"
  CHECK ("status" = 'CLOSED' OR "retained_day_id" IS NULL);

-- Un vote et une date retenue protègent leur jour : on ne retire pas un jour
-- voté ni la date retenue. Mais la cascade d'un sondage ou d'un compte
-- supprimé doit passer. PostgreSQL exécute chaque cascade comme une instruction
-- à part et y vérifie une contrainte RESTRICT ou NO ACTION ordinaire AVANT que
-- la cascade voisine (réponses, puis votes) ait eu lieu. Les deux contraintes
-- sont donc DIFFÉRÉES à la validation de la transaction : la cascade entière
-- est passée, les votes sont partis, et un retrait direct d'un jour voté reste
-- refusé.
ALTER TABLE "vote" ALTER CONSTRAINT "vote_poll_day_id_fkey" DEFERRABLE INITIALLY DEFERRED;

-- La date retenue est un jour DE CE sondage : clé composite vers
-- poll_day(poll_id, id).
ALTER TABLE "poll" ADD CONSTRAINT "poll_retained_day_fkey"
  FOREIGN KEY ("id", "retained_day_id") REFERENCES "poll_day"("poll_id", "id")
  ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- Une réponse a exactement une identité : un compte, ou un pseudo porté par
-- un appareil.
ALTER TABLE "response" ADD CONSTRAINT "response_single_identity" CHECK (
  ("user_id" IS NOT NULL AND "pseudonym" IS NULL AND "device_token_hash" IS NULL)
  OR ("user_id" IS NULL AND "pseudonym" IS NOT NULL AND "device_token_hash" IS NOT NULL)
);

-- Une réponse par compte et par sondage, une par appareil et par sondage.
CREATE UNIQUE INDEX "response_poll_user_key" ON "response"("poll_id", "user_id")
  WHERE "user_id" IS NOT NULL;
CREATE UNIQUE INDEX "response_poll_device_key" ON "response"("poll_id", "device_token_hash")
  WHERE "device_token_hash" IS NOT NULL;

-- Un seul résumé du créateur en attente par sondage.
CREATE UNIQUE INDEX "email_outbox_pending_owner_digest_key" ON "email_outbox"("poll_id")
  WHERE "template" = 'OWNER_DIGEST' AND "status" = 'PENDING';