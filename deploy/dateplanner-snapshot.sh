#!/usr/bin/env bash
#
# Snapshot de la VM DatePlanner avant un déploiement, puis ménage.
#
# Tourne sur l'HÔTE Proxmox, installé en /usr/local/sbin/dateplanner-snapshot
# (README.md § 6.6). Appelé avant chaque déploiement (deploy.md § 3.1) :
#
#   ssh root@192.168.1.10 dateplanner-snapshot v0.7.0
#
# Le snapshot s'appelle `avant_v0_7_0` : Proxmox refuse le point dans un nom.
# Une fois pris, seuls les SNAPSHOT_KEEP plus récents snapshots `avant_*`
# restent : celui de ce déploiement et celui du précédent. Un snapshot nommé
# autrement, pris à la main, n'est jamais supprimé.
#
# Variables lues dans l'environnement :
#   VMID           VM concernée (défaut : 102)
#   SNAPSHOT_KEEP  nombre de snapshots `avant_*` conservés (défaut : 2)

set -euo pipefail

VMID="${VMID:-102}"
SNAPSHOT_KEEP="${SNAPSHOT_KEEP:-2}"
VERSION="${1:-}"

if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage : dateplanner-snapshot vX.Y.Z" >&2
  exit 2
fi
# Zéro supprimerait aussi le snapshot qui vient d'être pris.
if [[ ! "$SNAPSHOT_KEEP" =~ ^[1-9][0-9]*$ ]]; then
  echo "SNAPSHOT_KEEP doit valoir au moins 1." >&2
  exit 2
fi

NAME="avant_${VERSION//./_}"

# Un échec ici arrête tout AVANT le ménage : l'ancien retour arrière ne part
# jamais sans que le nouveau soit pris. Un nom déjà pris est refusé par
# Proxmox, et c'est voulu : en reprenant un déploiement raté, le snapshot
# existant tient l'état d'avant la première tentative, le bon.
qm snapshot "$VMID" "$NAME" --description "Avant deploiement de $VERSION"
echo "Snapshot $NAME pris."

# Les snapshots `avant_*` au-delà des SNAPSHOT_KEEP plus récents. La date de
# prise fait foi, pas le numéro de version.
mapfile -t OLD < <(
  pvesh get "/nodes/$(hostname)/qemu/$VMID/snapshot" --output-format json |
    perl -MJSON::PP -e '
      my $keep = shift;
      my @snaps = sort { $b->{snaptime} <=> $a->{snaptime} }
        grep { $_->{name} =~ /^avant_/ } @{ decode_json(do { local $/; <STDIN> }) };
      print "$_->{name}\n" for @snaps[$keep .. $#snaps];
    ' "$SNAPSHOT_KEEP"
)

for SNAP in "${OLD[@]}"; do
  qm delsnapshot "$VMID" "$SNAP"
  echo "Snapshot $SNAP supprimé."
done

qm listsnapshot "$VMID"
