#!/usr/bin/env bash
#
# Publie une nouvelle version et la met en production, d'une seule commande
# (`deploy.md`) :
#
#   npm run release                   version déduite des commits depuis le dernier tag
#   npm run release -- minor          patch | minor | major | X.Y.Z
#   npm run release -- --preparer     s'arrête une fois la PR de version ouverte et contrôlée
#
# Dans l'ordre :
#   1. PR de version `chore/release-X.Y.Z` : `main` + `npm version`, rien d'autre ;
#   2. les contrôles de `PROJET.md` § 2 sur le commit de cette branche :
#      l'intégration continue (`.github/workflows/ci.yml`) est attendue et
#      doit finir verte ; désactivée sur GitHub, ils sont rejoués en local et
#      retenus pour ce commit - relancé, le script ne les rejoue pas sur un
#      commit qui les a déjà passés ;
#   3. fusion de la PR, tag annoté `vX.Y.Z` sur le commit de fusion, release
#      GitHub avec les notes générées ;
#   4. `scripts/deploy.sh vX.Y.Z` : snapshot, mise à jour, vérification.
#
# Chaque étape regarde où en est le dépôt avant d'agir. Relancé après un
# échec, le script REPREND : une PR ouverte est reprise, une PR fusionnée est
# taguée, un tag publié est déployé, une version en ligne est vérifiée. Sans
# argument, il reprend aussi une version fusionnée mais pas encore taguée, ou
# taguée mais pas encore en ligne, plutôt que d'en ouvrir une nouvelle. Si
# `main` a bougé pendant ce temps, la branche de version est refaite sur le
# nouveau `main` et contrôlée de nouveau : ce qui est fusionné est ce qui a
# été contrôlé.
#
# Le script change de branche dans la copie de travail : elle doit être
# propre (aucun fichier suivi modifié). Il finit sur `main`, à jour.

set -euo pipefail

VERSION=""
CI_WORKFLOW=ci.yml

usage() {
  sed -n '6,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit "${1:-2}"
}

step() { printf '\n==== %s\n' "$*"; }
die() { echo "$*" >&2; exit 1; }

remote_tag_exists() {
  git ls-remote --exit-code --tags origin "refs/tags/$1" >/dev/null 2>&1
}

main_version() {
  git show origin/main:package.json | package_version
}

# Le numéro d'une PR de la branche dans l'état donné (open, merged), ou rien.
pr_number() {
  gh pr list --head "$1" --state "$2" --json number --jq '.[0].number // empty'
}

# Une ligne « - #314 titre » par PR fusionnée dans l'intervalle, lue sur les
# commits de fusion de GitHub : « Merge pull request #314 from … », le titre
# de la PR en première ligne du corps.
merged_pull_requests() {
  local sha number
  for sha in $(git log --merges --format=%H "$1"); do
    number="$(git log -1 --format=%s "$sha" | sed -n 's/^Merge pull request \(#[0-9]*\) .*/\1/p')"
    [[ -n "$number" ]] || continue
    echo "- $number $(git log -1 --format=%b "$sha" | head -n 1)"
  done
}

bump_and_push() {
  local branch="$1"
  git switch -q -C "$branch" origin/main
  npm version "$VERSION" --no-git-tag-version >/dev/null
  git commit -q -am "chore(release): $VERSION"
  git push -q --force-with-lease -u origin "$branch"
}

# Vrai si le workflow de CI tourne sur GitHub (`disabled_manually` sinon).
ci_active() {
  [[ "$(gh api "repos/{owner}/{repo}/actions/workflows/$CI_WORKFLOW" --jq .state 2>/dev/null)" == active ]]
}

# Les passages de la CI sur un commit, au format demandé par `--jq`.
ci_runs() {
  gh run list --workflow "$CI_WORKFLOW" --commit "$1" --json databaseId,status,conclusion --jq "$2"
}

# Attend que la CI ait fini sur le commit, et qu'elle y soit verte. Deux
# passages par commit : la poussée et la pull request, attendus l'un et
# l'autre.
wait_for_ci() {
  local sha="$1" waited=0 running failed
  step "Intégration continue sur ${sha:0:7} (PROJET.md, § 2)"
  while true; do
    if [[ "$(ci_runs "$sha" length)" == 0 ]]; then
      # GitHub met quelques secondes à enregistrer le passage d'une poussée.
      (( waited < 300 )) || die "Aucun passage de la CI sur ${sha:0:7} après cinq minutes."
      sleep 10
      waited=$((waited + 10))
      continue
    fi
    running="$(ci_runs "$sha" '[.[] | select(.status != "completed") | .databaseId][0] // empty')"
    if [[ -n "$running" ]]; then
      gh run watch "$running" --interval 15 >/dev/null || true
      continue
    fi
    failed="$(ci_runs "$sha" '[.[] | select(.conclusion != "success") | .databaseId][0] // empty')"
    if [[ -n "$failed" ]]; then
      gh run view "$failed" >&2 || true
      die "La CI a échoué sur ${sha:0:7} : gh run view $failed --log-failed"
    fi
    echo "CI verte sur ${sha:0:7}."
    return
  done
}

# Les mêmes contrôles, rejoués sur le poste quand la CI est désactivée.
run_local_controls() {
  local sha marker
  sha="$(git rev-parse HEAD)"
  marker="$(git rev-parse --git-path release-controls)"
  if [[ -f "$marker" && "$(<"$marker")" == "$sha" ]]; then
    echo "Contrôles déjà passés sur ${sha:0:7}."
    return
  fi
  rm -f "$marker"

  step "Contrôles en local sur ${sha:0:7} (PROJET.md, § 2), la CI étant désactivée"
  # `npm install` et non `npm ci` : le serveur de développement tient des
  # fichiers de node_modules ouverts, et `npm ci` le viderait à moitié.
  npm install --no-audit --no-fund
  if ! git diff --quiet; then
    git diff --stat >&2
    die "npm install a modifié des fichiers suivis : le verrou de main n'est pas à jour."
  fi
  # Un client Prisma généré sur une autre branche fausserait typecheck et tests.
  npx prisma generate
  npm audit --omit=dev
  npm run typecheck
  npm run lint
  npm test
  # Un build de production refuse une adresse publique en clair : il reçoit
  # l'adresse réelle, comme dans la CI.
  NEXT_PUBLIC_SITE_URL=https://dateplanner.laserit.fr npm run build
  npm run e2e
  npm run e2e:perf
  echo "$sha" >"$marker"
}

run_controls() {
  if ci_active; then
    wait_for_ci "$(git rev-parse HEAD)"
  else
    run_local_controls
  fi
}

main() {
  local request="" prepare_only=0 arg
  for arg in "$@"; do
    case "$arg" in
      --preparer) prepare_only=1 ;;
      patch | minor | major) request="$arg" ;;
      -h | --help) usage 0 ;;
      *)
        [[ "$arg" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] || usage
        request="${arg#v}"
        ;;
    esac
  done

  cd "$(git rev-parse --show-toplevel)"
  # Lu une fois, avant de changer de branche.
  # shellcheck source=lib/release-version.sh
  source scripts/lib/release-version.sh
  local here
  here="$(pwd)"

  local tool
  for tool in git gh npm ssh curl; do
    command -v "$tool" >/dev/null || die "Outil manquant : $tool."
  done
  gh auth status >/dev/null 2>&1 || die "gh n'est pas authentifié (gh auth login)."
  git diff --quiet HEAD -- || die "Des fichiers suivis sont modifiés : commiter ou mettre de côté d'abord."

  step "État du dépôt"
  git fetch -q origin
  git fetch -q --tags origin

  local current kind
  current="$(main_version)"
  [[ "$current" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Version illisible dans package.json de main : « $current »."

  if [[ "$request" =~ ^[0-9] ]]; then
    VERSION="$request"
  elif ! remote_tag_exists "v$current"; then
    VERSION="$current"
    echo "main porte $current, pas encore taguée : reprise de cette version."
  elif [[ "$(git rev-list --count "v$current..origin/main")" == 0 ]]; then
    VERSION="$current"
    echo "Rien de nouveau sur main depuis v$current : reprise de son déploiement."
  else
    kind="${request:-$(git log --no-merges --format='%s%n%b' "v$current..origin/main" | release_kind "$current")}"
    VERSION="$(bump_version "$current" "$kind")"
    echo "Depuis v$current :"
    git log --no-merges --format='  %s' "v$current..origin/main"
    echo "Saut $kind : $VERSION."
  fi

  local tag="v$VERSION" branch="chore/release-$VERSION" pr open_branch
  # Deux PR de version ouvertes finiraient fusionnées l'une sur l'autre.
  for open_branch in $(gh pr list --state open --json headRefName --jq '.[].headRefName'); do
    if [[ "$open_branch" == chore/release-* && "$open_branch" != "$branch" ]]; then
      die "Une autre PR de version est ouverte ($open_branch) : la finir ou la fermer d'abord."
    fi
  done

  if remote_tag_exists "$tag"; then
    echo "$tag est déjà publié."
  else
    pr="$(pr_number "$branch" merged)"
    if [[ -z "$pr" ]]; then
      version_after "$VERSION" "$current" \
        || die "$VERSION ne passe pas après $current, la version de main."

      pr="$(pr_number "$branch" open)"
      if [[ -z "$pr" ]]; then
        step "PR de version $VERSION"
        bump_and_push "$branch"
        local body
        body="$(mktemp)"
        {
          echo "Version $VERSION."
          echo
          echo "Fusionné depuis v$current :"
          echo
          merged_pull_requests "v$current..origin/main"
        } >"$body"
        local url
        url="$(gh pr create --base main --head "$branch" --title "chore(release): $VERSION" --body-file "$body")"
        rm -f "$body"
        echo "$url"
        pr="${url##*/}"
      else
        step "PR de version #$pr, reprise"
        git switch -q -C "$branch" "origin/$branch"
      fi

      # Ce qui est fusionné doit être ce qui a été contrôlé : si main a bougé,
      # la branche est refaite dessus, et les contrôles la reprennent.
      while true; do
        if ! git merge-base --is-ancestor origin/main HEAD; then
          step "main a bougé : branche de version refaite sur le nouveau main"
          bump_and_push "$branch"
        fi
        run_controls
        git fetch -q origin
        git merge-base --is-ancestor origin/main HEAD && break
      done

      if (( prepare_only )); then
        echo
        echo "PR #$pr prête, contrôles verts. Pour publier et déployer :"
        echo "  npm run release -- $VERSION"
        return
      fi

      step "Fusion de la PR #$pr"
      local head_sha
      head_sha="$(git rev-parse HEAD)"
      # Depuis main : gh supprime la branche locale, qui ne doit plus être la
      # branche courante.
      git switch -q main
      gh pr merge "$pr" --merge --delete-branch --match-head-commit "$head_sha"
    elif (( prepare_only )); then
      echo "PR de version #$pr déjà fusionnée : rien à préparer."
      return
    else
      echo "PR de version #$pr déjà fusionnée."
    fi

    step "Tag $tag et release"
    local merge_sha
    merge_sha="$(gh pr view "$pr" --json mergeCommit --jq .mergeCommit.oid)"
    git fetch -q origin
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      [[ "$(git rev-parse "$tag^{commit}")" == "$merge_sha" ]] \
        || die "Le tag local $tag ne pointe pas sur le commit de fusion ${merge_sha:0:7}."
    else
      git tag -a "$tag" -m "Version $VERSION" "$merge_sha"
    fi
    git push -q origin "refs/tags/$tag"
  fi

  if (( prepare_only )); then
    echo "$tag est déjà publié : rien à préparer."
    return
  fi

  gh release view "$tag" >/dev/null 2>&1 \
    || gh release create "$tag" --verify-tag --generate-notes

  if [[ "$(git rev-parse --abbrev-ref HEAD)" != main ]]; then
    git switch -q main
  fi
  git merge -q --ff-only origin/main

  step "Déploiement de $tag"
  bash "$here/scripts/deploy.sh" "$tag"
}

on_exit() {
  local status=$?
  if (( status != 0 )) && [[ -n "$VERSION" ]]; then
    echo >&2
    echo "Arrêté. Une fois la cause corrigée, reprendre là où ça s'est arrêté :" >&2
    echo "  npm run release -- $VERSION" >&2
  fi
}
trap on_exit EXIT

# Tout le script est lu avant de s'exécuter : il change de branche, et bash
# relirait sinon la suite dans un fichier qui n'est peut-être plus le même.
main "$@"; exit
