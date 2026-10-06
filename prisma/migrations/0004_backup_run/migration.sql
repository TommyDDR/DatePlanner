-- Sauvegarde consignée : `scripts/backup.sh` pose ici chaque réussite, et
-- `/api/sante` signale quand la dernière date.

-- CreateTable
CREATE TABLE "backup_run" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_run_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_run_pkey" PRIMARY KEY ("id")
);
