#!/usr/bin/env bash
#
# Restauration d'une sauvegarde écrite par `scripts/backup.sh`.
#
# Une sauvegarde qu'on n'a jamais restaurée ne prouve rien : ce script est
# celui du TEST de restauration, à rejouer sur une machine vierge, et celui du
# jour où il faut vraiment s'en servir.
#
#   scripts/restore.sh /chemin/dateplanner-20261001-030000.dump
#
# Il remplace la base désignée par DATABASE_URL par le contenu de la
# sauvegarde. Il DEMANDE confirmation avant d'écrire, sauf avec
# RESTORE_YES=1, et refuse de tourner service démarré : restaurer sous un
# service qui écrit mélangerait deux états.
#
# Variables lues dans l'environnement, ou dans le `.env` du service :
#   DATABASE_URL   base à remplacer (elle doit exister, vide ou non)

set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage : $0 /chemin/dateplanner-AAAAMMJJ-HHMMSS.dump" >&2
  exit 1
fi

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# Lu comme systemd le lit, jamais exécuté (`scripts/lib/env-file.sh`).
# shellcheck source=lib/env-file.sh
source "$APP_DIR/scripts/lib/env-file.sh"
if [[ -f "$APP_DIR/.env" ]]; then
  load_env_file "$APP_DIR/.env"
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL n'est pas définie : rien à restaurer." >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet dateplanner 2>/dev/null; then
  echo "Le service dateplanner tourne : l'arrêter d'abord (sudo systemctl stop dateplanner)." >&2
  exit 1
fi

# Une sauvegarde lisible par pg_restore, et pas n'importe quel fichier.
pg_restore --list "$DUMP" >/dev/null

echo "Sauvegarde : $DUMP"
echo "Base       : remplacée (DATABASE_URL du .env)"
if [[ "${RESTORE_YES:-}" != "1" ]]; then
  read -r -p "Tout ce qui est en place sera remplacé. Taper « restaurer » pour continuer : " answer
  [[ "$answer" == "restaurer" ]] || { echo "Abandon."; exit 1; }
fi

echo "Restauration de la base…"
# `--clean --if-exists` retire ce que la base contient avant d'y remettre la
# sauvegarde. `pg_restore` écrit le script SQL et `psql` le joue : la
# connexion passe par l'ENVIRONNEMENT (`PG*`, voir backup.sh), jamais en
# argument. `ON_ERROR_STOP` arrête au premier échec, dans une seule
# transaction : une restauration à moitié jouée serait pire qu'aucune.
eval "$(node "$APP_DIR/scripts/lib/pg-env.mjs")"
pg_restore --clean --if-exists --no-owner --file=- "$DUMP" \
  | psql --no-psqlrc --quiet --single-transaction --set=ON_ERROR_STOP=1 >/dev/null
# La base répond et porte ses tables.
psql --no-psqlrc --quiet --tuples-only --command='SELECT count(*) FROM poll;' >/dev/null

echo "Migrations éventuelles…"
(cd "$APP_DIR" && ./node_modules/.bin/prisma migrate deploy)

echo "Terminé. Redémarrer le service : sudo systemctl start dateplanner"
echo "Puis vérifier : curl -fsS http://127.0.0.1:3000/api/sante"
