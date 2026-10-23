# shellcheck shell=bash
#
# Numéro de la version suivante, pour `scripts/release.sh`.
#
#   source scripts/lib/release-version.sh
#   git log --no-merges --format='%s%n%b' v0.8.0..origin/main | release_kind 0.8.0
#   bump_version 0.8.0 minor                                   # 0.9.0
#
# Les commits suivent les Conventional Commits (`feat(…)`, `fix(…)`,
# `chore(…)`) : une fonctionnalité fait une version MINEURE, tout le reste un
# CORRECTIF. Une rupture (`feat!:`, `BREAKING CHANGE`) fait une version
# MAJEURE à partir de 1.0.0 ; avant, c'est le chiffre du milieu qui la porte,
# comme le veut SemVer pour une version 0.x.

# Lit un package.json sur l'entrée, rend sa version. Sans node : la ligne
# telle que `npm version` l'écrit, au premier niveau.
package_version() {
  sed -n 's/^  "version": "\([^"]*\)",\{0,1\}\r\{0,1\}$/\1/p' | head -n 1
}

# Lit les sujets et corps de commits sur l'entrée, rend patch, minor ou major.
release_kind() {
  local current="$1" log
  log="$(cat)"
  if grep -Eq '^[a-z]+(\([^)]*\))?!:|^BREAKING[ -]CHANGE:' <<<"$log"; then
    if [[ "${current%%.*}" == 0 ]]; then echo minor; else echo major; fi
  elif grep -Eq '^feat(\([^)]*\))?:' <<<"$log"; then
    echo minor
  else
    echo patch
  fi
}

# La version qui suit X.Y.Z pour un saut patch, minor ou major.
bump_version() {
  local major minor patch
  IFS=. read -r major minor patch <<<"$1"
  case "$2" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
    *) echo "Saut de version inconnu : « $2 »." >&2; return 2 ;;
  esac
}

# Vrai si la version A passe après la version B (X.Y.Z, comparées nombre à
# nombre : 0.10.0 passe après 0.9.0).
version_after() {
  [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" == "$1" ]]
}
