# Tasks: Compteur de participants

**Input**: Design documents from `specs/002-compteur-participants/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/pages.md](contracts/pages.md), [quickstart.md](quickstart.md)

**Tests**: inclus. La constitution (principe III) exige au moins un test automatisé par exigence FR-xxx ; la correspondance est dans [quickstart.md](quickstart.md).

**Organization**: tâches groupées par user story, chacune testable seule.

## Format: `[ID] [P?] [Story] Description`

- **[P]** : parallélisable (fichiers différents, aucune dépendance sur une tâche inachevée)
- **[Story]** : user story concernée (US1, US2)

---

## Phase 1: Setup

**Purpose**: aucune initialisation : projet, dépendances et base existent déjà, aucune migration (research.md R1).

- [X] T001 Vérifier que la branche courante est `feat/compteur-participants` et que `npm run typecheck`, `npm run lint` et `npm test` passent avant toute modification (référence de départ)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: le nombre de participants lu côté serveur et son libellé, dont dépendent les deux stories.

**⚠️ CRITICAL**: aucune story ne commence avant la fin de cette phase.

### Tests (écrits d'abord, doivent échouer)

- [X] T002 [P] Créer `tests/unit/text.test.ts` : `participantCountLabel(0)` vaut « Personne n’a encore répondu » (même apostrophe typographique que `src/app/s/[publicId]/_sections/availability-list.tsx`), `participantCountLabel(1)` vaut « 1 participant », `participantCountLabel(3)` vaut « 3 participants », `participantCountLabel(1234)` vaut « 1234 participants » (nombre exact, sans abréviation ni séparateur) — FR-004
- [X] T003 [P] Dans `tests/integration/responses.test.ts`, ajouter un `describe('nombre de participants')` : avec `createPoll` et `createResponse` de `tests/helpers/factories.ts`, `getPollByPublicId(poll.publicId)` (de `src/server/polls/read.ts`) renvoie `respondents === 0` sans réponse ; `3` pour une réponse avec compte + deux réponses sans compte portant le MÊME pseudo ; et cette valeur égale `respondents` de la ligne du sondage dans `listOwnerPolls(ownerId)` — FR-002, FR-006
- [X] T004 Dans le même `describe` de `tests/integration/responses.test.ts` : après `submit` d'une réponse puis nouvelle `submit` modifiant ses jours, `respondents` reste `1` ; après `withdraw(publicId)` (retrait par le répondant), `respondents` vaut `0` — FR-002 (règles de data-model.md « modifier les jours … ne change pas le nombre », « la retirer (répondant) … −1 »)
- [X] T005 [P] Dans `tests/integration/poll-owner.test.ts`, ajouter un test : sondage à 2 réponses, `deleteResponse(ownerId, publicId, responseId)` de `src/server/polls/edit.ts`, puis `getPollByPublicId` renvoie `respondents === 1` ; clore puis rouvrir le sondage ne change pas la valeur — FR-002 (« supprimer (créateur) : −1 », « clore ou rouvrir : sans effet »)

### Implémentation

- [X] T006 [P] Ajouter dans `src/lib/text.ts` la fonction pure exportée `participantCountLabel(count: number): string` : `0` → `'Personne n’a encore répondu'`, sinon `plural(count, 'participant')`. Commentaire en français citant FR-004 (fait passer T002)
- [X] T007 Dans `src/server/polls/read.ts`, ajouter au type `PollView` le champ `respondents: number` (commentaire : « Nombre de réponses, même comptage que « Mes sondages » (FR-006) ») et, dans `getPollByPublicId`, ajouter `_count: { select: { responses: true } }` à l'`include` de `prisma.poll.findUnique`, puis `respondents: poll._count.responses` dans l'objet renvoyé. Aucun autre champ de la réponse n'est lu (FR-008). Fait passer T003, T004, T005
- [X] T008 Lancer `npm run typecheck` : corriger tout usage de `PollView` construit à la main (fixtures, tests) qui exigerait désormais `respondents`

**Checkpoint**: `npm test` vert ; le nombre et son libellé sont disponibles côté serveur.

---

## Phase 3: User Story 1 - Voir d'un coup d'œil combien de personnes ont répondu (Priority: P1) 🎯 MVP

**Goal**: la page `/s/[publicId]` affiche « N participants » dans son en-tête, pour tout visiteur, sondage ouvert ou clos.

**Independent Test**: ouvrir un sondage à trois réponses : l'en-tête affiche « 3 participants » sans aucune interaction.

### Tests (écrits d'abord, doivent échouer)

- [X] T009 [US1] Dans `e2e/respond.spec.ts`, ajouter un test : sondage créé par `db` (`e2e/helpers.ts`) sans réponse, visiteur anonyme : `page.getByTestId('compteur-participants')` est visible sans défilement à 1280 × 800 et contient « Personne n’a encore répondu » ; après une réponse avec pseudo : « 1 participant » ; avec trois réponses en base dont deux sur des jours tous différents : « 3 participants » — FR-001, FR-003, FR-004, scénarios US1-1 à US1-4
- [X] T010 [US1] Dans `e2e/respond.spec.ts`, ajouter un test : sondage clos (`status: 'CLOSED'`) avec deux réponses, puis sondage `requireAccount: true` avec une réponse, ouverts par un visiteur non connecté : le compteur est visible et affiche respectivement « 2 participants » et « 1 participant » — FR-003, scénarios US1-5 et US1-6

### Implémentation

- [X] T011 [P] [US1] Créer le composant serveur `src/app/s/[publicId]/_sections/participant-count.tsx` : `export function ParticipantCount({ count }: { count: number })` rendant un `<p role="status" data-testid="compteur-participants">` dont le texte est `participantCountLabel(count)` (`@/lib/text`) ; style sur une ligne avec les jetons existants (`label-tech` ou `text-sm text-[var(--color-text-muted)]`, cohérent avec l'en-tête), sans `whitespace-nowrap` pour que le texte puisse revenir à la ligne plutôt que déborder à 320 px. En-tête de commentaire en français citant FR-001, FR-007 et research.md R4 (nœud stable : seul le texte change à la relecture). Aucun nom ni identifiant rendu (FR-008)
- [X] T012 [US1] Dans `src/app/s/[publicId]/page.tsx`, importer `ParticipantCount` et le rendre dans le `<header>` du sondage, après le titre `<h1>` et la description éventuelle, avec `count={poll.respondents}` ; le rendu est inconditionnel (tous visiteurs, ouvert ou clos) — contrat [contracts/pages.md](contracts/pages.md). Fait passer T009, T010

**Checkpoint**: US1 livrable seule : compteur visible et juste au chargement.

---

## Phase 4: User Story 2 - Compteur à jour en direct (Priority: P2)

**Goal**: le compteur suit ajouts, retraits et suppressions sans rechargement, sur tous les écrans ouverts, en < 5 s (SC-003).

**Independent Test**: deux navigateurs sur le même sondage ; répondre dans le premier : le compteur du second passe de N à N+1 en quelques secondes.

Aucun code de direct à écrire (research.md R2) : `LivePoll` relit déjà la page à chaque événement `responses`. Cette phase prouve le comportement et l'annonce accessible.

### Tests

- [X] T013 [US2] Dans `e2e/live-updates.spec.ts`, étendre ou ajouter un test sur le modèle de « une réponse apparaît chez les autres en moins de cinq secondes, sans recharger » : un observateur ouvert sur un sondage à 2 réponses voit `compteur-participants` passer à « 3 participants » en moins de 5 s après la réponse d'un autre contexte, sans `reload` ; puis le répondant modifie ses jours : le compteur reste « 3 participants » ; puis le répondant retire sa réponse : « 2 participants » — FR-005, scénarios US2-1, US2-3, US2-4
- [X] T014 [US2] Dans `e2e/manage-poll.spec.ts` (ou `e2e/live-updates.spec.ts`), ajouter un test : un visiteur ouvert sur un sondage à 3 réponses ; le créateur, dans un autre contexte connecté (`signInAs`), supprime une réponse après confirmation ; le compteur du visiteur affiche « 2 participants » en moins de 5 s sans recharger — FR-005, scénario US2-2
- [X] T015 [US2] Dans le test de T013, vérifier que l'élément `compteur-participants` garde `role="status"` après la mise à jour et que le focus de l'observateur n'a pas bougé (`document.activeElement` inchangé) — FR-007

**Checkpoint**: US1 et US2 fonctionnent ; le compteur ne contredit jamais les pastilles.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T016 [P] Dans `e2e/accessibility.spec.ts`, s'assurer que le test « chaque page passe axe, dans les deux thèmes » couvre une page de sondage AVEC réponses (compteur non vide) ; ajouter une assertion `getByRole('status')` contient « participant » — FR-007, SC-004
- [X] T017 [P] Dans `e2e/calendar-layout.spec.ts` (ou `e2e/respond.spec.ts`), à 320 px de large, vérifier l'absence de défilement horizontal (`document.documentElement.scrollWidth <= clientWidth`) sur une page de sondage à 1234 réponses simulées ou, à défaut, avec un libellé long — SC-004, edge case « grand nombre »
- [X] T018 [P] Créer `docs/decisions/047-compteur-participants.md` (sections « Décision » et « Pourquoi », format de `docs/decisions/045-nom-de-domaine.md`) : participant = réponse enregistrée, lu par `_count.responses` comme « Mes sondages », compteur dans l'en-tête en `role="status"`, direct par relecture de page sans donnée dans le flux, visites non comptées
- [X] T019 [P] Mettre à jour `PROJET.md` : section « État » (fonctionnalité 002, compteur de participants) et carte du code (`_sections/participant-count.tsx`, `participantCountLabel`, `PollView.respondents`) ; invariant : le compteur et « Mes sondages » partagent le même comptage
- [X] T020 Dérouler les contrôles de [quickstart.md](quickstart.md) : `npm run typecheck`, `npm run lint` (0 erreur, 0 avertissement), `npm test`, `npm run build` (0 avertissement), `npm run e2e`, `npm audit --omit=dev` (0 faille) ; puis la vérification manuelle (étapes 1 à 8), dont la lecture NVDA

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : immédiat.
- **Foundational (Phase 2)** : après Setup ; bloque US1 et US2.
- **US1 (Phase 3)** : après Phase 2.
- **US2 (Phase 4)** : après US1 (le compteur doit exister à l'écran pour être observé en direct).
- **Polish (Phase 5)** : après US1 ; T016 et T017 après T012, T020 en dernier.

### Within Each Phase

- Tests d'abord (T002–T005 avant T006–T007 ; T009–T010 avant T012), ils doivent échouer avant l'implémentation.
- T007 avant T008 ; T006 et T007 avant T011/T012.
- T013 et T015 touchent le même fichier : séquentiels.

### Parallel Opportunities

- Phase 2 : T002, T003, T005 en parallèle ; T004 suit T003 (même fichier) ; puis T006 en parallèle de T007.
- Phase 3 : T011 en parallèle de l'écriture de T009/T010.
- Phase 5 : T016, T017, T018, T019 en parallèle.

---

## Parallel Example: Phase 2

```text
Task: "T002 tests/unit/text.test.ts — libellés 0, 1, 3, 1234"
Task: "T003+T004 tests/integration/responses.test.ts — nombre = réponses, = Mes sondages, modification/retrait"
Task: "T005 tests/integration/poll-owner.test.ts — suppression par le créateur, clore/rouvrir"
```

## Parallel Example: User Story 1

```text
Task: "T009/T010 e2e/respond.spec.ts — compteur visible, ouvert, clos, compte exigé"
Task: "T011 src/app/s/[publicId]/_sections/participant-count.tsx — composant"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 puis Phase 2 (nombre + libellé, testés).
2. Phase 3 : compteur dans l'en-tête.
3. **STOP and VALIDATE** : test indépendant US1, livrable seul.

### Incremental Delivery

1. Phases 1–2 : fondation.
2. US1 : compteur au chargement (MVP).
3. US2 : preuve du direct et de l'annonce accessible (aucun code de production supplémentaire attendu ; si T013/T014 échouent, corriger dans `src/app/s/[publicId]/_sections/participant-count.tsx` ou `src/app/s/[publicId]/page.tsx`, jamais en ajoutant une donnée au flux).
4. Polish : accessibilité, mise en page mobile, décision 047, `PROJET.md`, contrôles complets.

---

## Notes

- Pas de migration, pas de dépendance, pas de changement du flux `/api/s/[publicId]/flux`.
- Commentaires et textes en français, identifiants en anglais (constitution V).
- Commit après chaque phase ; livraison par pull request vers `main`.
