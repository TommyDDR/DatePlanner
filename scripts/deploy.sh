#!/usr/bin/env bash
#
# Met une version PUBLIÉE en production, depuis le poste de développement
# (`deploy.md`, § 3) :
#
#   npm run deploy -- v0.8.0            snapshot, code, build, migrations, redémarrage, vérification
#   npm run deploy -- --essai v0.8.0    dit ce qu'il ferait, sans rien toucher
#
# `npm run release` l'appelle en dernier ; seul, il sert à reprendre un
# déploiement ou à revenir à une version antérieure.
#
# Dans l'ordre :
#   1. le tag doit être publié sur origin : c'est de là que le serveur le tire ;
#   2. snapshot du conteneur par `dateplanner-snapshot` sur l'hôte Proxmox
#      (`deploy/dateplanner-snapshot.sh`), sauf s'il existe déjà - il tient
#      alors l'état d'avant la première tentative, le bon - ou pour revenir à
#      une version antérieure, qui n'a pas de « avant » à protéger ;
#   3. sur le conteneur, sous le compte du service : `git checkout` du tag,
#      `npm ci`, `npm run build`, PUIS `prisma migrate deploy`, puis le
#      redémarrage. Le build passe AVANT les migrations : il ne touche pas la
#      base - toutes les pages sont rendues à la requête -, et s'il échoue le
#      code revient à la version d'avant sur une base intacte, sans snapshot à
#      restaurer ;
#   4. `/api/sante` attendu à 200 sur le conteneur, puis par l'adresse publique.
#
# Revenir à une version antérieure n'est permis que si aucune migration ne
# les sépare : `migrate deploy` ne défait rien, et l'ancien code sur le
# nouveau schéma peut casser. Le script refuse alors et renvoie au snapshot
# (`deploy.md`, § 5).
#
# Un fichier de `deploy/` modifié entre les deux versions ne se réinstalle
# pas seul : le script le signale, la réinstallation reste à la main
# (`README.md` § 6).
#
# Variables lues dans l'environnement :
#   SITE_HOST     conteneur du site (défaut : admin@192.168.1.53)
#   PUBLIC_URL    adresse publique du site (défaut : https://dateplanner.laserit.fr)
#   PROXMOX_HOST  hôte Proxmox, pour le snapshot (défaut : root@192.168.1.10)
#   CTID          conteneur LXC du site (défaut : 202)

set -euo pipefail

SITE_HOST="${SITE_HOST:-admin@192.168.1.53}"
PUBLIC_URL="${PUBLIC_URL:-https://dateplanner.laserit.fr}"
PROXMOX_HOST="${PROXMOX_HOST:-root@192.168.1.10}"
CTID="${CTID:-202}"
APP_DIR=/opt/dateplanner
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"

usage() {
  echo "Usage : $0 [--essai] vX.Y.Z" >&2
  exit 2
}

DRY_RUN=0
if [[ "${1:-}" == "--essai" ]]; then
  DRY_RUN=1
  shift
fi
[[ $# -eq 1 && "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
TAG="$1"
SNAPSHOT="avant_${TAG//./_}"

step() { printf '\n== %s\n' "$*"; }

# La version servie : le tag exact, ou `vX-N-gSHA` si le conteneur est posé
# ailleurs. `</dev/null` : ssh lirait sinon l'entrée du script.
deployed_version() {
  ssh "$SITE_HOST" "sudo -n -u dateplanner -H git -C $APP_DIR describe --tags --always" </dev/null
}

snapshot_exists() {
  ssh "$PROXMOX_HOST" "pct listsnapshot $CTID" </dev/null | grep -qw "$SNAPSHOT"
}

step "Version $TAG"
git -C "$ROOT" fetch -q --tags origin
if ! git -C "$ROOT" ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null; then
  echo "Le tag $TAG n'est pas publié sur origin : le serveur ne pourrait pas le tirer." >&2
  exit 1
fi

DEPLOYED="$(deployed_version)"
echo "En production : $DEPLOYED"

if [[ "$DEPLOYED" == "$TAG" ]]; then
  echo "$TAG est déjà en production : vérification seule."
else
  DOWNGRADE=0
  if [[ "$DEPLOYED" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    && [[ "$(printf '%s\n%s\n' "${DEPLOYED#v}" "${TAG#v}" | sort -V | head -n 1)" == "${TAG#v}" ]]; then
    DOWNGRADE=1
  fi

  if (( DOWNGRADE )); then
    if ! git -C "$ROOT" diff --quiet "$TAG" "$DEPLOYED" -- prisma/migrations; then
      echo "Des migrations séparent $TAG de $DEPLOYED : l'ancien code sur le nouveau schéma" >&2
      echo "peut casser. Restaurer le snapshot depuis l'hôte (deploy.md, § 5)." >&2
      exit 1
    fi
    echo "Retour à une version antérieure, sans migration entre les deux : pas de snapshot."
  else
    step "Snapshot du conteneur $CTID"
    if snapshot_exists; then
      echo "$SNAPSHOT existe déjà : gardé tel quel, il tient l'état d'avant la première tentative."
    elif (( DRY_RUN )); then
      echo "[essai] Sur $PROXMOX_HOST : dateplanner-snapshot $TAG (prend $SNAPSHOT, puis ménage)."
    else
      ssh "$PROXMOX_HOST" "CTID=$CTID dateplanner-snapshot $TAG" </dev/null
    fi
  fi

  if git -C "$ROOT" rev-parse -q --verify "$DEPLOYED^{commit}" >/dev/null \
    && ! git -C "$ROOT" diff --quiet "$DEPLOYED" "$TAG" -- deploy/; then
    echo
    echo "Fichiers de deploy/ modifiés entre $DEPLOYED et $TAG, à réinstaller à la main"
    echo "après le déploiement (README.md : unités § 6.3, Traefik § 6.5, snapshot § 6.6) :"
    git -C "$ROOT" diff --name-only "$DEPLOYED" "$TAG" -- deploy/ | sed 's/^/  /'
  fi

  if (( DRY_RUN )); then
    echo
    echo "[essai] Sur $SITE_HOST : checkout de $TAG, npm ci, build, migrations, redémarrage."
    echo "[essai] Puis $PUBLIC_URL/api/sante attendu à 200. Rien n'a été touché."
    exit 0
  fi

  step "Mise à jour du conteneur"
  # Le script distant arrive par l'entrée de `bash -s` : chaque commande y lit
  # `/dev/null`, sans quoi elle avalerait la suite du script.
  ssh "$SITE_HOST" bash -s -- "$TAG" <<'REMOTE'
set -euo pipefail
TAG="$1"
APP_DIR=/opt/dateplanner
cd "$APP_DIR"

step() { printf '\n== %s\n' "$*"; }
as_app() { sudo -n -u dateplanner -H "$@" </dev/null; }
restart() { sudo -n systemctl restart dateplanner </dev/null; }
# Par l'hôte local : la redirection vers HTTPS le laisse passer
# (`src/lib/https-redirect.ts`).
healthy() {
  as_app node -e "fetch('http://127.0.0.1:3000/api/sante').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
}
wait_healthy() {
  for _ in $(seq 1 45); do
    healthy && return 0
    sleep 2
  done
  return 1
}
journal() { sudo -n journalctl -u dateplanner -n 40 --no-pager </dev/null || true; }

if [[ -n "$(as_app git status --porcelain --untracked-files=no)" ]]; then
  echo "Des fichiers suivis ont été modifiés sur le serveur : rien n'est touché." >&2
  as_app git status --short --untracked-files=no >&2
  exit 1
fi

PREVIOUS_SHA="$(as_app git rev-parse HEAD)"
PREVIOUS="$(as_app git describe --tags --always)"

step "Code : $PREVIOUS vers $TAG"
as_app git fetch -q --tags origin
as_app git checkout -q --detach "$TAG"

step "Dépendances"
as_app npm ci

step "Construction"
if ! as_app npm run build; then
  echo >&2
  echo "La construction de $TAG a échoué. Retour à $PREVIOUS, la base n'a pas été touchée." >&2
  as_app git checkout -q --detach "$PREVIOUS_SHA"
  as_app npm ci
  as_app npm run build
  restart
  if wait_healthy; then
    echo "$PREVIOUS est de nouveau en ligne." >&2
  else
    echo "$PREVIOUS ne répond pas non plus : voir le journal ci-dessous." >&2
    journal >&2
  fi
  exit 1
fi

step "Migrations"
as_app npx prisma migrate deploy

step "Redémarrage"
restart
if ! wait_healthy; then
  echo "Le site ne répond pas sur /api/sante après le redémarrage." >&2
  journal >&2
  echo "Revenir en arrière : deploy.md, § 5." >&2
  exit 1
fi
echo "Le site répond."
REMOTE
fi

step "Vérification"
DEPLOYED="$(deployed_version)"
if [[ "$DEPLOYED" != "$TAG" ]]; then
  echo "Le conteneur sert $DEPLOYED, pas $TAG." >&2
  exit 1
fi
RESPONSE="$(curl -s -w '\n%{http_code}' --max-time 20 "$PUBLIC_URL/api/sante" || true)"
CODE="${RESPONSE##*$'\n'}"
BODY="${RESPONSE%$'\n'*}"
if [[ "$CODE" != 200 ]]; then
  echo "$PUBLIC_URL/api/sante répond « $CODE » : le site tourne sur le conteneur, mais pas par" >&2
  echo "l'adresse publique. Regarder Traefik sur le conteneur proxy (README, § 6.5)." >&2
  exit 1
fi
echo "$TAG en production, $PUBLIC_URL/api/sante répond 200."
# Un retard ne tient pas à la version : il ne fait pas échouer le déploiement.
if [[ "$BODY" == *late* ]]; then
  echo "Attention, /api/sante signale un retard : $BODY (deploy.md, § 6)." >&2
fi
echo "Reste à ouvrir le site : l'accueil, un sondage ouvert dans deux fenêtres, la connexion avec Google."
