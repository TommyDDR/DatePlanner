-- Consigne une sauvegarde réussie, sur la ligne unique de `backup_run`.
--
-- Joué par `scripts/backup.sh` une fois l'archive écrite, et rejoué tel quel
-- par `tests/integration/backup.test.ts`. L'heure est écrite en UTC, comme
-- toutes les dates que Prisma range dans une colonne `TIMESTAMP(3)` : `now()`
-- seul y serait converti dans le fuseau de la session, et une base réglée sur
-- Europe/Paris daterait la sauvegarde de deux heures trop tard.
INSERT INTO "backup_run" ("id", "last_run_at")
VALUES (1, now() AT TIME ZONE 'UTC')
ON CONFLICT ("id") DO UPDATE SET "last_run_at" = EXCLUDED."last_run_at";
