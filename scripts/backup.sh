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
# ferait deux vérités, dont l'une finirait périmée.
if [[ -f "$APP_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/.env"
  set +a
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

# Rotation. `ls -t` trie du plus récent au plus ancien ; on supprime la queue.
mapfile -t OLD < <(ls -t "$BACKUP_DIR"/dateplanner-*.dump 2>/dev/null | tail -n "+$((BACKUP_KEEP + 1))")
for file in "${OLD[@]:-}"; do
  [[ -n "$file" ]] || continue
  echo "[$STAMP] Rotation : suppression de $(basename "$file")"
  rm -f "$file"
done

echo "[$STAMP] Terminé."
