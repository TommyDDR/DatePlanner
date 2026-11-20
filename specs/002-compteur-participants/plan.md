# Implementation Plan: Compteur de participants

**Branch**: `feat/compteur-participants` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-compteur-participants/spec.md`

## Summary

Afficher sur la page d'un sondage le nombre de participants (= nombre de réponses
enregistrées), visible de tous, à jour en direct. Le nombre est lu dans la même
requête que le sondage, avec le même comptage que « Mes sondages » et
l'administration (`_count.responses`), et rendu côté serveur dans l'en-tête de la
page. Le direct existant (flux SSE + `router.refresh()` à chaque événement
`responses`) relit déjà la page entière : le compteur suit sans code de direct
supplémentaire. Le libellé (« 1 participant », « N participants », « Personne n'a
encore répondu ») vient d'une fonction pure testée ; une région `role="status"`
annonce les changements aux lecteurs d'écran.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 22 LTS

**Primary Dependencies**: Next.js 16.4.2 (App Router, composants serveur), React 19.2.8, Prisma 7.10.0, Tailwind CSS 4.3.3 — aucune nouvelle dépendance

**Storage**: PostgreSQL 17 ; aucune migration (le nombre se déduit des réponses existantes)

**Testing**: Vitest 4.1.12 (unitaires, intégration sur vraie base), Playwright 1.63.0 + `@axe-core/playwright` (bout en bout, accessibilité)

**Target Platform**: serveur Linux (conteneur LXC 202), navigateurs récents bureau et mobile

**Project Type**: application web unique (Next.js)

**Performance Goals**: mise à jour chez les autres en < 5 s (SC-003), comme les pastilles ; aucun coût perceptible au rendu (un `COUNT` indexé ajouté à une requête existante)

**Constraints**: aucune donnée personnelle nouvelle (FR-008) ; lisible sur téléphone sans défilement horizontal, dans les deux thèmes (SC-004)

**Scale/Scope**: quelques centaines de réponses par sondage au plus ; 1 page touchée, 1 lecture enrichie, 1 fonction pure

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Vérification | Statut |
|----------|--------------|--------|
| I. Sécurité par construction | Le nombre est lu par `publicId`, comme la page elle-même, déjà publique ; aucune saisie utilisateur affichée par le compteur (un entier). | OK |
| II. Le serveur décide | Le nombre est calculé et rendu par le serveur ; le direct ne transporte toujours aucune donnée (l'événement déclenche une relecture). | OK |
| III. Logique pure, testée | Libellé dans `src/lib/text.ts` (pur, test unitaire) ; lecture testée sur vraie base ; parcours direct couvert en bout en bout. Chaque FR a un test (voir quickstart). | OK |
| IV. Données minimales | Aucune donnée collectée ni stockée en plus ; les visites ne sont pas comptées. | OK |
| V. Accessible, en français | `role="status"` pour l'annonce, contraste des jetons existants, contrôle axe ; textes en français, identifiants en anglais. | OK |
| VI. Sobriété | Aucune dépendance, aucune brique, aucune migration ; réutilise `plural`, `_count` et le direct existant. | OK |
| Flux de travail | Branche dédiée, cycle Spec Kit, décision consignée (`docs/decisions/047-compteur-participants.md`), `PROJET.md` mis à jour à la livraison. | OK |

Re-vérification après conception (Phase 1) : inchangée, aucun écart.

## Project Structure

### Documentation (this feature)

```text
specs/002-compteur-participants/
├── plan.md              # Ce fichier
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── pages.md         # Contrat d'affichage du compteur
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── text.ts                         # + participantCountLabel(count) (pur)
├── server/polls/
│   └── read.ts                         # PollView + respondents via _count.responses
└── app/s/[publicId]/
    ├── page.tsx                        # rend le compteur dans l'en-tête
    └── _sections/
        └── participant-count.tsx       # nouveau : affichage + role="status"

tests/
├── unit/
│   └── text.test.ts                    # nouveau : libellé 0, 1, N, grand nombre
└── integration/
    └── responses.test.ts               # nombre = réponses ; = « Mes sondages » ; suit ajout/retrait/suppression

e2e/
├── live-updates.spec.ts                # compteur N → N+1 → N chez un autre visiteur
└── accessibility.spec.ts               # axe sur la page avec compteur, deux thèmes

docs/decisions/047-compteur-participants.md
PROJET.md
```

**Structure Decision**: application Next.js unique existante. Le compteur est un
petit composant serveur propre à la page du sondage (`_sections/`), alimenté par la
lecture `getPollByPublicId` enrichie ; la logique de libellé reste dans le module
pur `src/lib/text.ts`.

## Complexity Tracking

Aucun écart à la constitution : section sans objet.
