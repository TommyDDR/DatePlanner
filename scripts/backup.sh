#!/usr/bin/env bash
#
# Sauvegarde de la base de DatePlanner.
#
# DatePlanner ne stocke aucun fichier : la base est tout son état. Lancé chaque
# nuit par deploy/dateplanner-backup.timer. Un passage à la main :
# `sudo systemctl start dateplanner-backup.service`, journal dans
# `journalctl -u dateplanner-backup`.
#
# Variables lues dans l'environnement, ou dans le `.env` du service :
#   DATABASE_URL   connexion PostgreSQL
#   BACKUP_DIR     destination (défaut : /var/backups/dateplanner)
#   BACKUP_KEEP    nombre de sauvegardes conservées (défaut : 14)

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Le `.env` du service porte déjà la connexion : la redéclarer dans l'unité
# ferait deux vérités, dont l'une finirait périmée. Il est LU comme systemd le
# lit, jamais exécuté (`scripts/lib/env-file.sh`).
# shellcheck source=lib/env-file.sh
source "$APP_DIR/scripts/lib/env-file.sh"
if [[ -f "$APP_DIR/.env" ]]; then
  load_env_file "$APP_DIR/.env"
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dateplanner}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL n'est pas définie : rien à sauvegarder." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
# Les sauvegardes portent les adresses email des comptes : le répertoire se
# ferme, et chaque archive n'est lisible que de root.
chmod 700 "$BACKUP_DIR"

# Écrite d'abord à côté, puis renommée : une sauvegarde interrompue en pleine
# nuit ne ressemble jamais à une sauvegarde valable.
WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

echo "[$STAMP] Sauvegarde de la base…"
# Format personnalisé et compressé : `pg_restore` peut en extraire une table
# seule, ce qu'un dump SQL brut ne permet pas.
#
# La connexion passe par l'ENVIRONNEMENT (`PGHOST`, `PGUSER`, `PGPASSWORD`…),
# jamais en argument : les arguments d'un processus sont lisibles de tout
# compte de la machine (`/proc/<pid>/cmdline`). `scripts/lib/pg-env.mjs`
# découpe `DATABASE_URL`, que libpq ne lit pas dans `PGDATABASE`.
eval "$(node "$APP_DIR/scripts/lib/pg-env.mjs")"
pg_dump --format=custom --compress=9 --file="$WORK/base.dump"

ARCHIVE="$BACKUP_DIR/dateplanner-$STAMP.dump"
mv "$WORK/base.dump" "$ARCHIVE"
chmod 600 "$ARCHIVE"

echo "[$STAMP] Écrite : $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# La réussite est consignée dans la base (`backup_run`) : `/api/sante` dit
# `"backup": "late"` quand elle date. Une sauvegarde qui échoue ne consigne
# rien, quelle qu'en soit la raison - script en erreur, timer arrêté, disque
# plein -, et c'est l'absence qui se voit (`scripts/lib/backup-recorded.sql`).
# Une écriture qui échoue ne défait pas l'archive, déjà en place : elle le dit,
# et la santé signalera une sauvegarde manquante plutôt que de la taire.
if psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file="$APP_DIR/scripts/lib/backup-recorded.sql" >/dev/null; then
  echo "[$STAMP] Consignée pour /api/sante."
else
  echo "[$STAMP] Archive écrite, mais la réussite n'a pas pu être consignée dans la base." >&2
fi

# Rotation. `ls -t` trie du plus récent au plus ancien ; on supprime la queue.
mapfile -t OLD < <(ls -t "$BACKUP_DIR"/dateplanner-*.dump 2>/dev/null | tail -n "+$((BACKUP_KEEP + 1))")
for file in "${OLD[@]:-}"; do
  [[ -n "$file" ]] || continue
  echo "[$STAMP] Rotation : suppression de $(basename "$file")"
  rm -f "$file"
done

echo "[$STAMP] Terminé."
