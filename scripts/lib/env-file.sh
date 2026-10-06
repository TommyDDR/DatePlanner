# shellcheck shell=bash
#
# Lecture du `.env` du service par les scripts d'exploitation (backup.sh,
# restore.sh), À LA MANIÈRE DE SYSTEMD, sans jamais l'exécuter.
#
#   source "$APP_DIR/scripts/lib/env-file.sh"
#   load_env_file "$APP_DIR/.env"
#
# Le service lit ce fichier par `EnvironmentFile=` : systemd prend tout ce qui
# suit le `=` comme valeur, espaces et chevrons compris. Le SOURCER dans un
# shell le lit autrement - le fichier y devient un script. Le mot de passe
# d'application Gmail (« abcd efgh ijkl mnop ») y lançait la commande `efgh`,
# et sous `set -e` la sauvegarde s'est arrêtée six nuits de suite, du 1er au
# 6 octobre 2026, pendant que le site tournait très bien avec le même fichier.
# Un `>` dans une adresse y ouvrirait une redirection, une fin de ligne
# Windows y collerait un `\r` à chaque valeur.
#
# Ce qui est lu, comme systemd : une ligne `CLÉ=valeur`, `export ` admis devant ;
# blancs retirés autour de la valeur ; une paire de guillemets ou d'apostrophes
# qui l'entoure retirée (entre guillemets, `\"` et `\\` redeviennent `"` et `\`) ;
# lignes vides et commentaires (`#`, `;`) ignorés ; `\r` final retiré. Rien
# n'est développé : `$(…)`, `$VAR` et les accents graves restent du texte. Seule
# la continuation de ligne par `\` final n'est pas reprise - aucun `.env` du
# projet n'en a besoin.
#
# Comme l'ancien `source`, une valeur du fichier remplace celle de
# l'environnement.

load_env_file() {
  local file="$1" line key value
  local skip='^[[:space:]]*([#;]|$)'
  local assignment='^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$'
  local double_quoted='^"(.*)"$'
  local single_quoted="^'(.*)'$"

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ $skip ]] && continue
    [[ "$line" =~ $assignment ]] || continue
    key="${BASH_REMATCH[2]}"
    value="${BASH_REMATCH[3]}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ "$value" =~ $double_quoted ]]; then
      value="${BASH_REMATCH[1]}"
      value="${value//\\\"/\"}"
      value="${value//\\\\/\\}"
    elif [[ "$value" =~ $single_quoted ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    export "$key=$value"
  done <"$file"
}
