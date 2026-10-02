-- Plusieurs dates retenues (décision 039) : la date retenue quitte la colonne
-- `poll.retained_day_id` pour une table, `retained_day`, qui en tient une ou
-- plusieurs par sondage.

-- AlterTable
ALTER TABLE "poll" ADD COLUMN     "multiple_retained_days" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "retained_day" (
    "poll_id" UUID NOT NULL,
    "poll_day_id" UUID NOT NULL,
    "poll_status" "poll_status" NOT NULL DEFAULT 'CLOSED',

    CONSTRAINT "retained_day_pkey" PRIMARY KEY ("poll_id","poll_day_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "poll_id_status_key" ON "poll"("id", "status");

-- AddForeignKey
ALTER TABLE "retained_day" ADD CONSTRAINT "retained_day_poll_id_poll_status_fkey" FOREIGN KEY ("poll_id", "poll_status") REFERENCES "poll"("id", "status") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "retained_day" ADD CONSTRAINT "retained_day_poll_id_poll_day_id_fkey" FOREIGN KEY ("poll_id", "poll_day_id") REFERENCES "poll_day"("poll_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Contraintes que Prisma ne sait pas déclarer (data-model.md).
-- ---------------------------------------------------------------------------

-- Un jour retenu n'existe que sur un sondage clos : sa ligne porte l'état
-- `CLOSED`, et sa clé vers `poll(id, status)` ne trouve un sondage que s'il
-- est clos. Rouvrir un sondage qui garde des jours retenus est refusé : la clé
-- est en `ON UPDATE NO ACTION`.
ALTER TABLE "retained_day" ADD CONSTRAINT "retained_day_poll_closed" CHECK ("poll_status" = 'CLOSED');

-- Un jour retenu protège son jour, comme un vote (décision 027) : la clé est
-- DIFFÉRÉE pour que la cascade d'un sondage ou d'un compte supprimé passe.
ALTER TABLE "retained_day" ALTER CONSTRAINT "retained_day_poll_id_poll_day_id_fkey" DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- Reprise de l'existant : chaque date retenue devient une ligne de la table,
-- puis l'ancienne colonne disparaît avec ses contraintes.
-- ---------------------------------------------------------------------------

INSERT INTO "retained_day" ("poll_id", "poll_day_id")
SELECT "id", "retained_day_id" FROM "poll" WHERE "retained_day_id" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "poll" DROP CONSTRAINT "poll_retained_day_fkey";

ALTER TABLE "poll" DROP CONSTRAINT "poll_retained_day_only_when_closed";

-- AlterTable
ALTER TABLE "poll" DROP COLUMN "retained_day_id";
