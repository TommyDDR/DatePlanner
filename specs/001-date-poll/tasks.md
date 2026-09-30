---

description: "Task list for DatePlanner — sondages de dates"
---

# Tasks: DatePlanner — sondages de dates

**Input**: Design documents from `/specs/001-date-poll/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: inclus. La constitution (principe III) exige au moins un test automatisé par exigence
fonctionnelle et par invariant de sécurité, l'intégration contre un vrai PostgreSQL 17 et les
parcours critiques dans un vrai navigateur. Dans chaque story, écrire les tests d'abord et
vérifier qu'ils échouent.

**Organization**: tâches groupées par user story (priorités de spec.md).

**Référence** : « porter depuis laserit.fr » = copier le fichier de `C:\dev\codex\SiteLasercut`
indiqué, puis l'adapter (imports, noms, valeurs de `src/config/`), sans changer son
comportement ni retirer ses commentaires utiles.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallélisable (fichiers différents, aucune dépendance sur une tâche inachevée)
- **[Story]**: user story concernée (US1 à US7)

## Path Conventions

Projet unique à la racine (plan.md) : `src/`, `prisma/`, `tests/unit/`, `tests/integration/`,
`e2e/`, `deploy/`, `scripts/`, `docs/decisions/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: initialiser le projet avec la pile et les contrôles de laserit.fr

- [X] T001 Créer `package.json` (`"private": true`, `"type": "module"`, scripts `dev`, `build` = `prisma generate && next build`, `start`, `lint` = `eslint .`, `typecheck` = `tsc --noEmit`, `test` = `vitest run`, `e2e` = `playwright test`, `db:migrate` = `prisma migrate dev`) avec les versions EXACTES : dependencies `next@16.3.4`, `react@19.2.8`, `react-dom@19.2.8`, `@prisma/client@7.10.0`, `@prisma/adapter-pg@7.10.0`, `pg@8.23.0`, `zod@4.5.4`, `@node-rs/argon2@2.2.0`, `nodemailer@10.0.12` ; devDependencies `prisma@7.10.0`, `typescript@5.9.3`, `eslint@9.39.5`, `eslint-config-next@16.3.4`, `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3`, `vitest@4.1.11`, `@playwright/test@1.63.0`, `@axe-core/playwright` (version exacte relevée par `npm view @axe-core/playwright version`, puis reportée dans plan.md, Technical Context), `tsx@4.23.13`, `dotenv@17.4.2`, `@types/node@26.4.0`, `@types/pg@8.23.1`, `@types/react@19.2.18`, `@types/react-dom@19.2.5` (pas de `@types/nodemailer` : Nodemailer 10 fournit ses types) ; `overrides` repris de laserit.fr ; puis `.npmrc` avec `save-exact=true`, et `npm install` pour produire `package-lock.json`
- [X] T002 [P] Créer `tsconfig.json` (strict, `noUncheckedIndexedAccess`, alias `@/*` → `src/*`) et `next.config.ts` minimal (porté depuis laserit.fr, sans les réglages d'images)
- [X] T003 [P] Créer `eslint.config.mjs` (porté depuis laserit.fr, `eslint-config-next`, 0 avertissement toléré)
- [X] T004 [P] Créer `postcss.config.mjs` pour Tailwind 4 (porté depuis laserit.fr)
- [X] T005 [P] Créer `prisma.config.ts` (porté depuis laserit.fr : `import 'dotenv/config'`, URL lue dans `DATABASE_URL`, dossier `prisma/migrations`)
- [X] T006 [P] Créer `vitest.config.ts` et `tests/setup.ts` : chargement de `.env.test`, deux projets `unit` (`tests/unit/**`) et `integration` (`tests/integration/**`, exécution séquentielle, un seul fil)
- [X] T007 [P] Créer `playwright.config.ts` : Chromium seul, serveur `next dev` dédié sur le port 3100 (dossier de sortie `.next/e2e`) avec `.env.test` et `RATE_LIMIT_DISABLED=1` pour ce serveur seulement — comme laserit.fr, un serveur de production refusant une adresse publique en `http://` et gardant l'anti-flood actif —, trace et capture à l'échec, rapport HTML dans `playwright-report/`
- [X] T008 [P] Créer `.gitignore` (`node_modules`, `.next`, `.env`, `.env.test`, `playwright-report`, `test-results`, `*.tsbuildinfo`) et `.env.example` documentant sans valeur chaque variable de quickstart.md § 2 (`DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `APP_SECRET`, `CRON_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_DRIVER`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `RATE_LIMIT_DISABLED`, `RATE_LIMIT_ALLOWLIST`)
- [X] T009 [P] Créer `.github/workflows/ci.yml` calqué sur celui de laserit.fr : service `postgres:17` avec contrôle de disponibilité, Node 22, `npm ci`, `npm audit --omit=dev`, `npx prisma generate`, `npx prisma migrate deploy`, écriture de `.env.test` depuis les variables du job (`EMAIL_DRIVER=console`, `RATE_LIMIT_DISABLED` vide), `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, installation de Chromium, `npm run e2e`, rapport Playwright en artefact à l'échec

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schéma, configuration, modules purs partagés, infrastructure serveur, gabarit visuel et calendrier

**⚠️ CRITICAL**: aucune user story ne commence avant la fin de cette phase

### Hygiène du dépôt

- [X] T010 [P] Écrire `tests/unit/repository-hygiene.test.ts` (constitution I, « aucun secret versionné ») : via `git ls-files`, aucun fichier `.env*` suivi hormis `.env.example` ; `.gitignore` couvre `.env` et `.env.test` ; aucun fichier suivi ne contient de clé privée (`-----BEGIN … PRIVATE KEY-----`) ni d'affectation valorisée `*_SECRET=`, `*_PASSWORD=`, `*_CLIENT_SECRET=` (valeur non vide) ; `.env.example` n'a que des valeurs vides ; toutes les versions de `package.json` (`dependencies`, `devDependencies`, `overrides`) sont exactes, sans `^`, `~`, `*`, `>` ni `x`, et `.npmrc` porte `save-exact=true` (constitution VI)

### Schéma et accès aux données

- [X] T011 Écrire dans `prisma/schema.prisma` le générateur, la source (sans URL, Prisma 7) et les modèles `User`, `Session`, `PasswordResetToken` de data-model.md : `User.email` « unique, stocké en minuscules, sans espaces ; 3 à 254 caractères » ; `displayName` « 1 à 60 caractères après retrait des espaces » ; `passwordHash` nullable ; `googleId` « unique » nullable ; `emailProvedAt` nullable ; `failedLoginCount` « 0 par défaut » ; `lockedUntil`, `inactivityWarnedAt` nullables ; `lastActiveAt`, `createdAt` ; `Session.tokenHash` « unique ; SHA-256 du jeton du cookie », `userId` en cascade, `createdAt`, `expiresAt`, `lastSeenAt` ; `PasswordResetToken.tokenHash` « unique », `expiresAt` « +1 heure », `usedAt` nullable, `userId` en cascade
- [X] T012 Ajouter à `prisma/schema.prisma` les modèles `Poll` et `PollDay` : `Poll.publicId` « unique ; 22 caractères base64url, 128 bits aléatoires » ; `ownerId` en cascade ; `title` « obligatoire, 1 à 120 caractères après retrait des espaces » ; `description` « 0 à 2 000 caractères ; vide enregistré comme `null` » ; `status` enum `OPEN | CLOSED` « `OPEN` à la création » ; `retainedDayId` nullable ; `requireAccount` « `false` par défaut » ; `notifyOwner` « `true` par défaut » ; `ownerDigestSentAt` nullable ; `ownerDigestCursor` ; `closedAt` nullable ; `createdAt`, `updatedAt` ; `PollDay.day` en `@db.Date`, « unique avec `pollId` », `pollId` en cascade
- [X] T013 Ajouter à `prisma/schema.prisma` les modèles `Response` et `Vote` : `Response.userId` nullable en cascade ; `pseudonym` « 1 à 50 caractères après retrait des espaces » nullable ; `deviceTokenHash` nullable ; `createdAt`, `updatedAt` ; `Vote` à clé primaire `(responseId, pollDayId)`, `responseId` en cascade, `pollDayId` en **NoAction**, rendue différée par la migration (T015)
- [X] T014 Ajouter à `prisma/schema.prisma` les modèles `EmailOutbox` (`template` enum `PASSWORD_RESET | OWNER_DIGEST | RETAINED_DAY | INACTIVITY_WARNING`, `status` enum `PENDING | SENT | CANCELLED | FAILED`, `payload` json, `pollId` nullable, `sendAfter`, `attempts` « ≤ 5, puis `FAILED` », `lastError`, `createdAt`, `sentAt`), `RateLimitHit` (`bucket`, `key`, `weight` défaut 1, `at`, index `(bucket, key, at)`) et `MaintenanceRun` (ligne unique `id`, `lastRunAt`)
- [X] T015 Générer la migration initiale `prisma/migrations/0001_init/migration.sql` puis y ajouter à la main : `CHECK (status = 'CLOSED' OR retained_day_id IS NULL)` ; `vote_poll_day_id_fkey` rendue `DEFERRABLE INITIALLY DEFERRED` ; clé étrangère composite `(id, retained_day_id)` → `poll_day(poll_id, id)` en `NO ACTION DEFERRABLE INITIALLY DEFERRED` (unicité `(poll_id, id)` sur `poll_day`) — différées pour laisser passer les cascades, voir data-model.md ; sur `response`, `CHECK ((user_id IS NOT NULL AND pseudonym IS NULL AND device_token_hash IS NULL) OR (user_id IS NULL AND pseudonym IS NOT NULL AND device_token_hash IS NOT NULL))` ; index uniques partiels `(poll_id, user_id) WHERE user_id IS NOT NULL` et `(poll_id, device_token_hash) WHERE device_token_hash IS NOT NULL` ; index unique partiel `email_outbox(poll_id) WHERE template = 'OWNER_DIGEST' AND status = 'PENDING'`
- [X] T016 Créer `src/server/db/client.ts` (porté depuis laserit.fr : `PrismaPg`, singleton sur `globalThis`)
- [X] T017 Créer `tests/helpers/db.ts` (vidage de toutes les tables entre deux tests d'intégration) et `tests/helpers/factories.ts` (`createUser`, `createSessionFor`, `createPoll({ days, owner, status, requireAccount })`, `createResponse({ poll, user | pseudonym+deviceHash, days })`)

### Configuration et modules purs

- [X] T018 [P] Créer `src/config/limits.ts` : `SESSION` (cookie `dp_session`, glissante 30 j, plafond 90 j, prolongation au plus toutes les heures), `DEVICE` (cookie `dp_appareil`, 13 mois), seaux de research.md R11 (`loginPerIp` 10/15 min, `registerPerIp` 5/h, `resetPerIp` 3/h, `resetPerAccount` 3/h, `pollCreatePerUser` 20/h, `responsePerIp` 30/h, `responsePerPollIp` 10/h, `googleSigninPerIp` 20/h), `LIVE_UPDATES` (canal `dateplanner_live`, battement 25 s, durée 55 min, reconnexion 3000 ms, 6 flux par adresse), `POLL_LIMITS` (titre 120, description 2000, pseudo 50, nom 60, 366 jours), `DIGEST` (30 min entre deux résumés, premier résumé 15 min après la première nouvelle réponse), `OUTBOX` (5 essais)
- [X] T019 [P] Créer `src/config/retention.ts` : sondage supprimé 12 mois après son dernier jour ; compte inactif averti à 3 ans, supprimé 30 jours après l'avertissement ; emails envoyés purgés à 30 jours ; jeton de réinitialisation 1 h
- [X] T020 [P] Créer `src/config/identity.ts` : nom `DatePlanner`, `SITE_URL` lu dans `NEXT_PUBLIC_SITE_URL` (repli `https://dateplanner.laserit.fr` en production, refus de démarrer si l'adresse de production n'est pas en `https`), identité légale de l'éditeur-hébergeur reprise de `src/config/business.ts` de laserit.fr (nom, adresse, téléphone, email de contact)
- [X] T021 [P] Créer `src/lib/paris-day.ts` (`todayInParis(now)` → `AAAA-MM-JJ` via `Intl` et `Europe/Paris` ; `isPast(day, today)`) et `tests/unit/paris-day.test.ts` (changement d'heure, minuit Paris vs UTC)
- [X] T022 [P] Porter `src/lib/date-picker.ts` depuis laserit.fr à l'identique, et porter ses tests vers `tests/unit/date-picker.test.ts`
- [X] T023 [P] Créer `src/lib/poll-rules.ts` et `tests/unit/poll-rules.test.ts` : `normalizeTitle` (retrait des espaces, 1 à 120), `normalizeDescription` (≤ 2 000, vide → `null`), `normalizePseudonym` (retrait des espaces, 1 à 50), `normalizeDisplayName` (1 à 60), `validateProposedDays(days, today, existingCount)` (format `AAAA-MM-JJ`, doublons retirés, aucun jour passé, au moins 1, total ≤ 366), `validateResponseDays(days, pollDays, today)` (au moins 1, tous parmi les jours du sondage, aucun passé) — erreurs typées, jamais de levée
- [X] T024 [P] Créer `src/lib/validation.ts` : schémas Zod de chaque entrée de contracts/server-actions.md, construits sur `poll-rules`, messages en français ; `PublicId` = `^[A-Za-z0-9_-]{22}$`, `Day` = `^\d{4}-\d{2}-\d{2}$`
- [X] T025 [P] Créer `src/lib/action-result.ts` : types `ActionResult<T>` et `ActionError` exactement comme dans contracts/server-actions.md, aides `ok()` et `fail()`
- [X] T026 [P] Porter `src/lib/safe-redirect.ts` (`safeInternalPath`) et ses tests vers `tests/unit/safe-redirect.test.ts`
- [X] T027 [P] Porter `src/lib/csp.ts` et `src/lib/https-redirect.ts` depuis laserit.fr (adresse `dateplanner.laserit.fr`, aucune origine tierce ; `form-action 'self'` seul, le départ vers Google étant un lien) avec leurs tests vers `tests/unit/csp.test.ts` et `tests/unit/https-redirect.test.ts`
- [X] T028 Créer `src/proxy.ts` (porté : un nonce par requête, en-tête CSP, `x-nonce`, et nouvelle pose du cookie `dp_session` présent à chaque navigation avec les options de `session-cookie.ts`, pour que le cookie suive la prolongation glissante de la base) et compléter `next.config.ts` : redirections HTTPS de `https-redirect`, en-têtes `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive, `frame-ancestors 'none'`
- [X] T029 [P] Porter `src/components/csp-nonce.tsx` (`CspNonceProvider`, `useCspNonce`)

### Infrastructure serveur

- [X] T030 [P] Porter `src/server/auth/password.ts` (argon2id, `hashPassword`, `verifyPassword`, `fakeVerify`, `verifyOptionalPassword`) avec `tests/unit/password-hash.test.ts`
- [X] T031 Porter `src/lib/session-cookie.ts` (`sessionCookieOptions`, `sessionExpiryFrom`, `sessionAbsoluteExpiry`, `sessionNeedsRenewal`, valeurs de `SESSION`) et `src/server/auth/session.ts` (`createSession`, `getSessionUser` avec prolongation glissante et plafond absolu, `destroySession`, `destroyAllSessions`, `destroyOtherSessions`, purges, `issueToken`) avec `SessionUser = { id, email, displayName, hasPassword, emailProvedAt, sessionCreatedAt }` et mise à jour de `User.lastActiveAt` au plus une fois par jour (remise à `null` de `inactivityWarnedAt`) ; tests dans `tests/unit/session-cookie.test.ts` (cookie `dp_session` : `HttpOnly`, `SameSite=Lax`, `Secure` en production et seulement là, chemin `/`, durée de 30 jours, échéance jamais au-delà du plafond de 90 jours — constitution I) et `tests/integration/session.test.ts`
- [X] T032 [P] Porter `src/server/ratelimit/index.ts` (fenêtre glissante en base, `clientIp` depuis `X-Real-IP` avec `::ffff:` ramené en IPv4, `RATE_LIMIT_ALLOWLIST` exacte, `RATE_LIMIT_DISABLED` sans effet en production) avec `tests/integration/ratelimit.test.ts`
- [X] T033 [P] Porter `src/server/events/bus.ts` : événement `{ pollId, kind: 'responses' | 'poll' | 'deleted', at }`, `publish` qui ne lève jamais, `subscribe(pollId, listener)` filtré par sondage ; tests dans `tests/integration/bus.test.ts`
- [X] T034 [P] Porter `src/server/notifications/transport.ts` (pilotes `console`, `gmail`, `smtp`) et `src/server/notifications/outbox.ts` (`enqueueEmail(input, tx)`, envoi après validation de la transaction, `flushOutbox` avec 5 essais puis `FAILED`, `cancelPendingForPoll(pollId)`), plus `src/server/notifications/templates.ts` (squelette : `escapeHtml`, branches texte et HTML, rendu au moment de l'envoi) ; tests dans `tests/integration/outbox.test.ts` dont « un échec SMTP laisse l'entrée `PENDING` et ne lève pas » (FR-043)
- [X] T035 Créer `src/app/api/sante/route.ts` (`SELECT 1`, 200 `{ status: 'ok' }` ou 503, `"maintenance": "late"` au-delà de 30 min sans passage) avec `tests/integration/health.test.ts`
- [X] T036 Créer `src/server/maintenance/index.ts` et `src/app/api/maintenance/route.ts` (`POST`, `Authorization: Bearer CRON_SECRET` sinon 401 ; `flushOutbox`, purges des sessions, jetons et seaux, horodatage `MaintenanceRun`) avec `tests/integration/maintenance.test.ts`

### Gabarit visuel et calendrier

- [X] T037 Créer `src/app/globals.css` en portant les jetons et styles de base de laserit.fr (`@theme` avec `light-dark()`, encre, papier, braise, jade, traits, polices, rayons) et ajouter `--color-vote` (aplat braise) et `--color-retained` (aplat jade), plus une règle globale `@media (prefers-reduced-motion: reduce)` qui neutralise animations et transitions sur tout le site (FR-033)
- [X] T038 Créer `src/app/layout.tsx` : Space Grotesk et JetBrains Mono par `next/font`, `lang="fr"`, `CspNonceProvider`, en-tête (marque DatePlanner, « Mes sondages » ou « Connexion » selon la session), pied de page (mentions légales, confidentialité), métadonnées par défaut `noindex`
- [X] T039 [P] Écrire `tests/fixtures/laserit-tokens.json` (valeurs clair et sombre des jetons de couleur, polices et rayons relevés dans `src/app/globals.css` de laserit.fr) et `tests/unit/design-tokens.test.ts` : chaque jeton de la fixture est présent dans `src/app/globals.css` avec la même valeur, et `src/app/layout.tsx` charge Space Grotesk et JetBrains Mono (FR-031)
- [X] T040 [P] Créer `src/app/not-found.tsx`, `src/app/error.tsx` et `src/app/global-error.tsx` (textes en français ; `not-found` dit « Sondage introuvable » sous `/s/`, « Page introuvable » ailleurs)
- [X] T041 [P] Créer `src/app/robots.ts` et `src/app/sitemap.ts` selon contracts/http-api.md (`Disallow: /s/`, `/api/`, `/compte`, `/mes-sondages`, `/nouveau` ; sitemap : `/`, `/mentions-legales`, `/confidentialite`)
- [X] T042 Porter `src/components/date-picker.tsx` depuis laserit.fr (modes, glissé, colonnes, semaines, clavier, vues mois et année) en ne changeant que les imports

**Checkpoint**: `npm run typecheck`, `npm run lint`, `npm test` verts ; les user stories peuvent commencer

---

## Phase 3: User Story 1 - Créer un sondage et obtenir son lien de partage (Priority: P1) 🎯 MVP

**Goal**: un visiteur crée un compte local, crée un sondage (titre, description, jours) et reçoit un lien de partage copiable (FR-001, FR-002, FR-004, FR-005, FR-007 à FR-012)

**Independent Test**: créer un compte, créer un sondage de trois jours, copier le lien, l'ouvrir en fenêtre privée : titre, description et trois jours s'affichent

### Tests for User Story 1 ⚠️

- [X] T043 [P] [US1] Écrire `tests/unit/password-rules.test.ts` : 10 caractères minimum, minuscule, majuscule, chiffre, caractère spécial (FR-002)
- [X] T044 [P] [US1] Écrire `tests/integration/auth-service.test.ts` : inscription (adresse mise en minuscules) ; inscription sur une adresse existante avec le bon mot de passe ⇒ connecté, avec un faux ⇒ `AUTH_FAILED` identique à la connexion ; connexion en échec indifférenciée ; hachage factice sur compte inconnu ; verrou progressif ; seaux `loginPerIp` et `registerPerIp` (FR-001, FR-005)
- [X] T045 [P] [US1] Écrire `tests/integration/password-reset.test.ts` : demande toujours `ok` ; email `PASSWORD_RESET` mis en file seulement si le compte existe ; jeton à usage unique (écriture conditionnelle `usedAt IS NULL`) ; jeton expiré refusé ; réinitialisation ⇒ `emailProvedAt` posé s'il manquait, toutes les sessions fermées puis une ouverte (FR-004)
- [X] T046 [P] [US1] Écrire `tests/integration/create-poll.test.ts` : session exigée ; titre vide refusé ; aucun jour refusé ; jour passé refusé ; 367 jours refusés ; `publicId` de 22 caractères, unique ; `requireAccount` et `notifyOwner` enregistrés ; `ownerDigestCursor` initialisé ; seau `pollCreatePerUser` (FR-007 à FR-012)
- [X] T047 [P] [US1] Écrire `e2e/create-poll.spec.ts` : « Créer un sondage » sans session ⇒ `/connexion?suite=/nouveau` ⇒ inscription ⇒ retour sur `/nouveau` ; validation sans titre ⇒ champ signalé, saisie conservée ; glissé sur une plage, clic sur une initiale de colonne et sur un numéro de semaine, jour passé inerte ; création ⇒ lien affiché et copié ; ouverture du lien dans un second contexte ⇒ titre, description, jours (scénarios US1 1 à 6)

### Implementation for User Story 1

- [X] T048 [P] [US1] Porter `src/lib/password-rules.ts` (règle et `PASSWORD_HINT`) depuis laserit.fr
- [X] T049 [US1] Créer `src/server/auth/service.ts` : `register` (présente le mot de passe à `login` si l'adresse existe), `login` (échec unique, `fakeVerify`, `failedLoginCount`, `lockedUntil` progressif), `logout`, `requestPasswordReset` (jeton via `issueToken`, `PASSWORD_RESET` mis en file), `resetPassword` (écriture conditionnelle, `emailProvedAt` posé seulement s'il est nul, `destroyAllSessions` puis `createSession`)
- [X] T050 [US1] Ajouter le modèle `PASSWORD_RESET` à `src/server/notifications/templates.ts` selon contracts/emails.md (lien `/reinitialisation?jeton=…`, 1 h)
- [X] T051 [US1] Créer `src/app/(auth)/actions.ts` : actions `register`, `login`, `logout`, `requestPasswordReset`, `resetPassword` (schémas de `validation.ts`, seaux de `limits.ts`, champ leurre, `suite` passé par `safeInternalPath`, résultats `ActionResult`)
- [X] T052 [P] [US1] Porter `src/components/password-input.tsx` (afficher ou masquer le mot de passe)
- [X] T053 [US1] Créer `src/app/(auth)/connexion/page.tsx`, `src/app/(auth)/inscription/page.tsx`, `src/app/(auth)/mot-de-passe-oublie/page.tsx` et `src/app/(auth)/reinitialisation/page.tsx` (formulaires qui conservent la saisie en erreur, règle du mot de passe sous le champ, redirection si déjà connecté, `noindex`)
- [X] T054 [US1] Créer `src/server/polls/create.ts` : `createPoll(ownerId, input)` en transaction, `publicId` = `randomBytes(16)` en base64url (22 caractères) avec nouvel essai sur conflit d'unicité, insertion des `PollDay`, revalidation des jours avec `todayInParis`, `ownerDigestCursor = now`
- [X] T055 [US1] Créer `src/app/nouveau/actions.ts` : action `createPoll` (session exigée, seau `pollCreatePerUser`, redirection vers `/s/{publicId}?cree=1`)
- [X] T056 [US1] Créer `src/app/nouveau/page.tsx` et `src/app/nouveau/poll-form.tsx` : titre, description avec compteur, `DatePicker` en mode `multiple` avec `min` = aujourd'hui (Paris) et message au-delà de 366 jours, cases « Répondants connectés uniquement » (décochée) et « Me prévenir des nouvelles réponses par email » (cochée), saisie conservée en erreur ; sans session, redirection vers `/connexion?suite=/nouveau`
- [X] T057 [P] [US1] Créer `src/components/copy-link.tsx` (API presse-papiers avec repli par sélection, « Lien copié » annoncé en `aria-live`)
- [X] T058 [US1] Créer `src/server/polls/read.ts` (`getPollByPublicId` : `publicId` mal formé ⇒ `null` sans requête) et `src/app/s/[publicId]/page.tsx` minimal : titre, description, liste des jours proposés regroupés par mois (le calendrier en lecture seule arrive avec T072), `noindex`, `notFound()` si absent, bandeau « Sondage créé » avec `CopyLink` pour le propriétaire quand `?cree=1`

**Checkpoint**: US1 fonctionne seule (T047 vert)

---

## Phase 4: User Story 2 - Répondre à un sondage, avec ou sans compte (Priority: P2)

**Goal**: n'importe qui répond par le lien, connecté ou sous un pseudo reconnu par l'appareil, uniquement sur les jours proposés à venir ; il peut modifier ou retirer sa réponse (FR-013 à FR-019, lecture de FR-040)

**Independent Test**: sur un sondage existant, sans session : saisir un pseudo, cocher deux jours proposés, valider ; recharger : la réponse est retrouvée et modifiable

### Tests for User Story 2 ⚠️

- [X] T059 [P] [US2] Écrire `tests/integration/responses.test.ts` : réponse sans compte créée avec pseudo et empreinte d'appareil ; seconde soumission du même appareil ⇒ mise à jour, pas de doublon ; réponse connectée sous le nom du compte, pseudo refusé ; jour non proposé dans une requête forgée ⇒ refus total, aucun vote écrit ; jour passé refusé ; zéro jour refusé ; sondage `CLOSED` ⇒ `POLL_CLOSED` ; `requireAccount` sans session ⇒ `ACCOUNT_REQUIRED`, mais une réponse sans compte déjà donnée reste retirable par son appareil ; retrait par son auteur seulement ; deux soumissions simultanées ⇒ une seule réponse ; appareil portant une réponse anonyme puis session ouverte ⇒ la réponse lue et modifiée est celle du compte (aucune), la réponse anonyme reste intacte et hors d'atteinte, et une soumission connectée crée une seconde réponse ; après déconnexion, la réponse anonyme est de nouveau lue et modifiable ; seaux `responsePerIp` et `responsePerPollIp` (FR-013 à FR-019, FR-040, SC-004)
- [X] T060 [P] [US2] Écrire `tests/integration/device.test.ts` : cookie `dp_appareil` posé une fois (`HttpOnly`, `SameSite=Lax`, `Secure` en production) ; seule l'empreinte SHA-256 est en base ; un autre appareil ne voit ni ne modifie la réponse
- [X] T061 [P] [US2] Écrire `e2e/respond.spec.ts` : réponse sans compte ; retour avec jours pré-cochés ; modification ; retrait ; jour non proposé inerte ; pseudo vide ou fait d'espaces refusé ; sondage à compte exigé ⇒ aucun champ pseudo et invitation à se connecter ; réponse anonyme, puis connexion sur le même navigateur ⇒ formulaire vierge sous le compte, puis déconnexion ⇒ réponse anonyme pré-remplie (scénarios US2 1 à 8, cas limite « se connecte ensuite »)

### Implementation for User Story 2

- [X] T062 [P] [US2] Créer `src/server/auth/device.ts` : `readDeviceTokenHash()`, `ensureDeviceToken()` (jeton de 256 bits, cookie `dp_appareil` de 13 mois), `hashDeviceToken()`
- [X] T063 [US2] Créer `src/server/polls/responses.ts` : `submitResponse(publicId, actor, days, pseudonym)` en transaction (sondage `OPEN`, garde `requireAccount`, `validateResponseDays` contre les `PollDay` et `todayInParis`, création ou mise à jour par `(poll, user)` ou `(poll, deviceTokenHash)` avec reprise sur violation d'unicité, remplacement des votes) ; `withdrawResponse(publicId, actor)` ; l'acteur est soit un compte (filtre `user_id` SEULEMENT, la réponse anonyme de l'appareil est ignorée), soit un appareil sans session (filtre `device_token_hash`) ; résultat `{ created: boolean }`
- [X] T064 [US2] Créer `src/app/s/[publicId]/actions.ts` : actions `submitResponse` et `withdrawResponse` (schémas, seaux, champ leurre, `ensureDeviceToken` pour une réponse sans compte)
- [X] T065 [US2] Créer `src/app/s/[publicId]/_sections/response-form.tsx` : les six situations de contracts/pages.md (connecté nouveau ou existant — réponse anonyme de l'appareil ignorée —, sans compte nouveau ou existant, compte exigé, sondage clos), `DatePicker` avec `disabled` = jours non proposés ou passés, champ pseudo (1 à 50), boutons Valider, Mettre à jour, Retirer ma réponse, erreurs par champ
- [X] T066 [US2] Intégrer le formulaire dans `src/app/s/[publicId]/page.tsx` : lecture côté serveur de la réponse de l'acteur courant dans `src/server/polls/read.ts` (session ouverte ⇒ réponse du compte seulement ; sans session ⇒ réponse de l'empreinte d'appareil)

**Checkpoint**: US1 et US2 fonctionnent (T061 vert)

---

## Phase 5: User Story 3 - Voir qui est disponible, à jour pour tout le monde (Priority: P3)

**Goal**: pastilles de votes, votants au survol et au focus, liste « Qui est disponible ? », mise à jour en direct chez tous (FR-020 à FR-023)

**Independent Test**: même sondage dans deux navigateurs ; une réponse dans le premier apparaît dans le second en moins de 5 s ; le survol du jour liste le répondant

### Tests for User Story 3 ⚠️

- [X] T067 [P] [US3] Écrire `tests/unit/availability.test.ts` : comptes et noms par jour, réponse connectée marquée, noms triés, au-delà de 20 votants « et N autres », jours sans vote absents
- [X] T068 [P] [US3] Écrire `tests/integration/live-stream.test.ts` : `publicId` inconnu ⇒ 404 ; événement d'un autre sondage non transmis ; message limité à `{ kind, at }` ; 7e flux simultané de la même adresse ⇒ 429 ; `submitResponse` et `withdrawResponse` publient `responses`
- [X] T069 [P] [US3] Écrire `e2e/live-updates.spec.ts` : deux contextes, B vote, A voit la pastille en moins de 5 s sans recharger ; infobulle au survol et au focus clavier ; liste « Qui est disponible ? » visible en largeur téléphone (375 px) ; sondage dont les jours s'étendent sur plusieurs mois ⇒ calendrier ouvert sur le mois du premier jour proposé à venir, mois porteurs de jours signalés (scénarios US3 1 à 5, cas limite « plusieurs mois », SC-003, SC-008)

### Implementation for User Story 3

- [X] T070 [P] [US3] Créer `src/lib/availability.ts` (construction des jours, comptes et noms à partir des votes ; troncature à 20 noms)
- [X] T071 [US3] Ajouter `getPollSynthesis(pollId)` à `src/server/polls/read.ts` : votes groupés par jour en une requête, nom = `User.displayName` pour une réponse connectée, `pseudonym` sinon
- [X] T072 [US3] Étendre `src/components/date-picker.tsx` : prop `badges` (pastille à aplat `--color-vote`, texte `--color-on-ember`, `aria-label` « N votes »), infobulle des votants au survol et au focus (`role="tooltip"`, `aria-describedby`), prop `markedMonths` signalée dans la navigation, prop `retainedDay` (aplat jade), prop `readOnly` (consultation : aucun jour ne se choisit, la navigation et le clavier restent) ; sans changer les comportements portés en T042
- [X] T073 [P] [US3] Créer `src/app/s/[publicId]/_sections/availability-list.tsx` : liste « Qui est disponible ? » par jour, nombre et noms, marque des réponses connectées
- [X] T074 [US3] Créer `src/app/api/s/[publicId]/flux/route.ts` selon contracts/http-api.md (porté de `api/evenements` : `retry`, `ready`, `change`, battement 25 s, fermeture à 55 min, compteur de flux par adresse limité à 6 ⇒ 429, 404 pour un sondage inconnu)
- [X] T075 [US3] Publier `responses` après la transaction dans `submitResponse` et `withdrawResponse` de `src/app/s/[publicId]/actions.ts`
- [X] T076 [US3] Créer `src/components/live-poll.tsx` : `EventSource` sur `/api/s/{publicId}/flux`, `router.refresh()` sur `change` (regroupés sur 300 ms) et sur `ready` après une coupure, arrêt sur erreur définitive
- [X] T077 [US3] Intégrer pastilles, infobulles, liste et `LivePoll` dans `src/app/s/[publicId]/page.tsx`

**Checkpoint**: le parcours créer, répondre, voir en direct est complet (T069 vert)

---

## Phase 6: User Story 4 - Se connecter avec un compte Google (Priority: P4)

**Goal**: connexion et inscription par Google, rattachement sûr aux comptes locaux (FR-003)

**Independent Test**: depuis `/connexion`, choisir Google : compte créé et connecté, `/nouveau` accessible

### Tests for User Story 4 ⚠️

- [X] T078 [P] [US4] Écrire `tests/unit/google-token.test.ts` (porté) : jeton accepté seulement si `aud` = notre client, `iss` Google, non expiré, `email_verified` vrai
- [X] T079 [P] [US4] Écrire `tests/unit/google-handshake.test.ts` (porté) : cookie signé relu, altération refusée, `state` différent refusé, `suite` analysée
- [X] T080 [P] [US4] Écrire `tests/integration/google-login.test.ts` : compte neuf créé sans mot de passe avec `emailProvedAt` ; reconnaissance par `googleId` même si l'adresse a changé ; rattachement à un compte local à adresse prouvée qui garde son mot de passe ; rattachement à un compte local à adresse NON prouvée ⇒ `passwordHash` effacé et toutes ses sessions fermées ; compte portant déjà un autre `googleId` jamais repris ; seau `googleSigninPerIp` distinct de `loginPerIp`

### Implementation for User Story 4

- [X] T081 [P] [US4] Porter `src/server/auth/google-handshake.ts` (cookie `dp_google` de 10 min signé avec `APP_SECRET`)
- [X] T082 [US4] Porter `src/server/auth/google.ts` (URL d'autorisation avec PKCE `S256`, échange du code, `parseIdToken`) et y écrire `loginWithGoogle` avec la protection contre la pré-appropriation de research.md R5
- [X] T083 [US4] Créer `src/app/api/connexion/google/route.ts` et `src/app/api/connexion/google/retour/route.ts` selon contracts/http-api.md (cookie toujours effacé, raisons `annule`, `refuse`, `adresse-non-verifiee`, `indisponible`)
- [X] T084 [US4] Porter `src/lib/google-signin-notice.ts` (raison ⇒ message en français) et ajouter le bouton Google et l'avis d'échec à `src/app/(auth)/connexion/page.tsx` et `src/app/(auth)/inscription/page.tsx`

**Checkpoint**: US4 fonctionne seule

---

## Phase 7: User Story 5 - Gérer ses sondages (Priority: P5)

**Goal**: liste des sondages, modification, ajout et retrait de jours, modération, clôture avec date retenue, réouverture, suppression, résumé par email et annonce de la date retenue (FR-024 à FR-028, FR-039 à FR-043)

**Independent Test**: créer deux sondages, ouvrir « Mes sondages », clore l'un avec une date retenue, supprimer l'autre : bandeau et date en jade sur le premier, « introuvable » sur le second

### Tests for User Story 5 ⚠️

- [X] T085 [P] [US5] Écrire `tests/unit/poll-state.test.ts` : transitions du tableau de data-model.md (`close`, `setRetainedDay`, `reopen`) ; date retenue seulement en `CLOSED` ; `reopen` l'efface
- [X] T086 [P] [US5] Écrire `tests/unit/digest.test.ts` : prochain envoi = `max(maintenant + 15 min, dernier envoi + 30 min)` ; 5 réponses en 10 min ⇒ un seul envoi ; résumé vide ⇒ annulé et curseur avancé
- [X] T087 [P] [US5] Écrire `tests/unit/signed-link.test.ts` : signature valide acceptée ; altérée, d'un autre objet ou d'un autre sondage refusée
- [X] T088 [P] [US5] Écrire `tests/integration/poll-owner.test.ts` : chaque action par un non-créateur ⇒ `NOT_FOUND` ; modification du titre et de la description ; ajout de jours (passé refusé, total ≤ 366, doublons ignorés) ; retrait d'un jour voté ⇒ `DAY_HAS_VOTES`, du dernier jour ⇒ `LAST_DAY` ; vote simultané au retrait ⇒ vote conservé ; options ; clôture avec et sans date ; `setRetainedDay` seulement en `CLOSED` et jour du sondage ; réouverture ; deux clôtures simultanées ⇒ une seule appliquée, une seule annonce `RETAINED_DAY` mise en file ; clôture et réouverture simultanées ⇒ état final cohérent (`retainedDayId` nul si `OPEN`) ; suppression d'une réponse ; suppression en cascade d'un sondage clos PORTANT des votes et une date retenue (doit réussir, contrainte `NO ACTION`), emails en attente annulés ; liste « Mes sondages » (ordre, nombre de répondants, état, date retenue)
- [X] T089 [P] [US5] Écrire `tests/integration/notifications.test.ts` : 5 réponses en 10 min ⇒ un seul `OWNER_DIGEST` listant les 5, programmé 15 min après la première ; réponse retirée avant l'envoi absente ; `notifyOwner = false` ⇒ rien ; `RETAINED_DAY` aux seuls répondants connectés, dédoublonné, créateur exclu ; lien de désactivation valide et invalide ; en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` ; valeurs saisies échappées dans la branche HTML
- [X] T090 [P] [US5] Écrire `e2e/manage-poll.spec.ts` : « Mes sondages » ; modification du titre ; ajout d'un jour ; retrait d'un jour voté impossible ; suppression d'une réponse ; bascule « répondants connectés uniquement » ; clôture avec date retenue ⇒ bandeau, date en jade, plus de formulaire ; réouverture ; suppression ⇒ lien introuvable (scénarios US5 1 à 10)

### Implementation for User Story 5

- [X] T091 [P] [US5] Créer `src/lib/poll-state.ts` (transitions et gardes du tableau de data-model.md)
- [X] T092 [P] [US5] Créer `src/lib/digest.ts` (instant du prochain résumé, contenu à partir des réponses postérieures au curseur)
- [X] T093 [P] [US5] Créer `src/lib/signed-link.ts` (HMAC-SHA-256 avec `APP_SECRET`, objet `owner-digest`, comparaison à temps constant)
- [X] T094 [US5] Créer `src/server/polls/edit.ts` : `updatePollDetails`, `addPollDays`, `removePollDay` (`DELETE … WHERE NOT EXISTS (vote)` et au moins un jour restant), `setPollOptions`, `deleteResponse`, `deletePoll` (`cancelPendingForPoll`) ; chaque écriture porte `owner_id` dans son `WHERE` et zéro ligne touchée ⇒ `NOT_FOUND`
- [X] T095 [US5] Créer `src/server/polls/state.ts` : `closePoll`, `setRetainedDay`, `reopenPoll` en écritures conditionnelles sur `status`, avec mise en file de `RETAINED_DAY` dans la transaction quand une date est désignée ou changée
- [X] T096 [US5] Créer `src/server/notifications/digest.ts` (`scheduleOwnerDigest(pollId, tx)` appuyé sur l'index unique du résumé en attente, rendu à l'envoi avec avancée du curseur, diffusion `RETAINED_DAY`) et ajouter les modèles `OWNER_DIGEST` et `RETAINED_DAY` à `src/server/notifications/templates.ts` selon contracts/emails.md, en-têtes `List-Unsubscribe` compris
- [X] T097 [US5] Appeler `scheduleOwnerDigest` depuis `submitResponse` dans `src/server/polls/responses.ts` quand `created` est vrai et `notifyOwner` actif
- [X] T098 [US5] Ajouter à `src/app/s/[publicId]/actions.ts` les actions du créateur de contracts/server-actions.md (`updatePollDetails`, `addPollDays`, `removePollDay`, `setPollOptions`, `closePoll`, `setRetainedDay`, `reopenPoll`, `deleteResponse`, `deletePoll`), publication `poll`, `responses` ou `deleted` après la transaction
- [X] T099 [US5] Créer `src/app/s/[publicId]/_sections/owner-panel.tsx` (rendu seulement pour le propriétaire) : titre et description, ajout de jours (`DatePicker` depuis aujourd'hui, jours existants exclus), retrait réservé aux jours sans vote, options, clôture avec choix facultatif de la date retenue parmi les jours proposés, changement de date, réouverture, suppression d'une réponse et du sondage avec confirmation, copie du lien
- [X] T100 [US5] Ajouter à `src/app/s/[publicId]/page.tsx` le bandeau « Sondage clos », la date retenue en jade (prop `retainedDay`) et le panneau du créateur
- [X] T101 [US5] Créer `src/app/mes-sondages/page.tsx` et `listOwnerPolls` dans `src/server/polls/read.ts` (titre, nombre de répondants, date de création décroissante, état, date retenue)
- [X] T102 [US5] Créer `src/app/notifications/resume/desactiver/page.tsx`, son action `disableOwnerDigest` dans `src/app/notifications/resume/desactiver/actions.ts`, et `src/app/api/notifications/resume/desactiver/route.ts` (`POST` en un clic, toujours 200)

**Checkpoint**: US5 fonctionne ; le parcours complet de la spec est couvert

---

## Phase 8: User Story 6 - Découvrir le service sur une page d'accueil marquante (Priority: P6)

**Goal**: page d'accueil animée, légère, indexable (FR-032 à FR-034)

**Independent Test**: sur ordinateur et à 375 px : l'animation se joue, les trois étapes se lisent, « Créer un sondage » mène à la création ou à la connexion

### Tests for User Story 6 ⚠️

- [X] T103 [P] [US6] Écrire `e2e/landing.spec.ts` : appel à l'action visible sans défiler à 1280×800 et 375×667 ; aucun défilement horizontal ; `prefers-reduced-motion: reduce` ⇒ aucune animation en cours, état final affiché ; démonstration et trois étapes présentes ; le bouton mène à `/nouveau` ou `/connexion?suite=/nouveau` ; contenu principal (accroche et bouton) affiché en moins de 2,5 s sous réseau 4G simulé (limitation réseau de Chromium) (FR-032, FR-033, SC-006)

### Implementation for User Story 6

- [X] T104 [US6] Créer `src/components/landing-demo.tsx` : grille d'un mois en SVG tracée comme un trait de découpe (`stroke-dashoffset`), jours qui s'allument, pastilles qui apparaissent et comptent, date retenue en jade ; animations CSS sur `transform` et `opacity` seulement ; état final sous `prefers-reduced-motion` ; `aria-hidden` avec une description textuelle voisine
- [X] T105 [US6] Créer `src/app/page.tsx` : accroche, démonstration, trois étapes, aperçu du partage, second appel à l'action ; métadonnées indexables (titre, description, canonique, Open Graph)
- [X] T106 [P] [US6] Créer `src/app/icon.svg` (marque DatePlanner dans l'esprit des icônes de laserit.fr)

**Checkpoint**: US6 fonctionne seule

---

## Phase 9: User Story 7 - Thème clair ou sombre (Priority: P7)

**Goal**: thème du système à la première visite, choix explicite retenu, sans flash (FR-029 à FR-031)

**Independent Test**: système en sombre ⇒ page sombre ; bascule en clair puis rechargement ⇒ reste clair

### Tests for User Story 7 ⚠️

- [X] T107 [P] [US7] Écrire `tests/unit/theme.test.ts` (porté) : seules `light` et `dark` sont relues du stockage
- [X] T108 [P] [US7] Écrire `e2e/theme.spec.ts` : système sombre avec JavaScript désactivé ⇒ fond sombre (pas de dépendance au script) ; choix clair conservé après rechargement avec système sombre ; premier rendu déjà au bon thème (attribut posé avant hydratation) ; contraste des pastilles et textes vérifié par axe dans les deux thèmes

### Implementation for User Story 7

- [X] T109 [P] [US7] Porter `src/lib/theme.ts` (`THEME_INIT_SCRIPT`, clé `dp-theme`, `readStoredTheme`)
- [X] T110 [US7] Porter `src/components/theme-script.tsx`, `src/components/theme-store.ts` et `src/components/theme-toggle.tsx` (deux positions) et les brancher dans `src/app/layout.tsx` (script dans le `<head>` avec le nonce, bascule dans l'en-tête)

**Checkpoint**: toutes les user stories fonctionnent

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: compte, conformité, conservation, sécurité transverse, exploitation et documentation

- [X] T111 [P] Créer `src/server/auth/account.ts` (`updateDisplayName`, `deleteAccount` en cascade), `src/app/compte/page.tsx` et `src/app/compte/actions.ts` (suppression avec mot de passe, ou connexion de moins de 10 min pour un compte sans mot de passe ⇒ sinon `REAUTH_REQUIRED`) et `tests/integration/account.test.ts` : suppression d'un compte dont les sondages portent des votes et qui a répondu à des sondages d'autrui ⇒ réussit, tout est emporté, les sondages d'autrui gardent leurs autres réponses (FR-006)
- [X] T112 [P] Créer `src/app/mentions-legales/page.tsx` et `src/app/confidentialite/page.tsx` à partir de `src/config/identity.ts` et `src/config/retention.ts` (données, finalités, durées, cookies `dp_session`, `dp_appareil`, `dp_google`, stockage du thème, droits), indexables ; `tests/unit/privacy-policy.test.ts` confronte les durées affichées à `retention.ts` (FR-036)
- [X] T113 Créer `src/server/maintenance/retention.ts` (sondages supprimés 12 mois après leur dernier jour ; `INACTIVITY_WARNING` à 3 ans d'inactivité ; suppression 30 jours après l'avertissement sauf activité ; emails envoyés purgés à 30 jours), l'appeler depuis `src/server/maintenance/index.ts`, ajouter le modèle `INACTIVITY_WARNING` à `src/server/notifications/templates.ts`, et écrire `tests/integration/retention.test.ts`
- [X] T114 [P] Écrire `tests/integration/security.test.ts` et porter `tests/unit/csp-source.test.ts` : CSP sans `'unsafe-inline'`, aucun `<script` sans nonce dans `src/`, redirections HTTPS, `noindex` sur `/s/`, titres et pseudos contenant du balisage rendus comme texte dans les pages et les emails (FR-035, FR-037)
- [X] T115 [P] Écrire `e2e/accessibility.spec.ts` : axe sur chaque page de contracts/pages.md dans les deux thèmes ; création et réponse au clavier seul avec focus visible ; sous `prefers-reduced-motion: reduce`, aucune animation ni transition en cours sur `/`, `/nouveau` et `/s/…` après un vote et une bascule de thème (FR-033, FR-034, SC-009)
- [X] T116 [P] Écrire `tests/integration/performance.test.ts` : sondage de 60 jours et 100 répondants, `getPollSynthesis` sous 200 ms ; et `e2e/performance.spec.ts` : ce sondage affiché complet en moins de 2 s sous réseau 4G simulé (SC-005)
- [X] T117 [P] Créer les fichiers d'exploitation : `deploy/dateplanner.service` (compte `dateplanner`, `/opt/dateplanner`, `EnvironmentFile`, abandon après 5 échecs par minute), `deploy/dateplanner-proxy-distant.conf` (écoute réseau, tas Node borné), `deploy/dateplanner-maintenance.service` et `.timer` (toutes les 10 min, `Persistent=true`), `deploy/dateplanner-backup.service` et `.timer` (vers 3 h, `Persistent=true`), `deploy/journald-dateplanner.conf` (500 Mo, 1 mois), `deploy/traefik/dateplanner.yml` (`Host(\`dateplanner.laserit.fr\`)` ⇒ `http://192.168.1.53:3000`, `certResolver: letsencrypt`)
- [X] T118 [P] Porter `scripts/backup.sh`, `scripts/restore.sh` et `scripts/lib/pg-env.mjs` depuis laserit.fr, en retirant la partie `storage/` (base seule)
- [X] T119 [P] Rédiger `deploy.md` (tag, snapshot `qm snapshot 102 avant_vX_Y_Z`, mise à jour, vérifications de quickstart.md § 5, retour arrière) et `README.md` (installation locale, CNAME OVH `dateplanner` ⇒ `laserit.fr.`, fichier Traefik sur la VM proxy, règle `ufw allow from 192.168.1.51 to any port 3000 proto tcp`, client OAuth Google et son URI de retour, mot de passe d'application Gmail)
- [X] T120 [P] Consigner les décisions de research.md (R1 à R19) et les cinq clarifications de la spec dans `docs/decisions/NNN-titre.md`, un fichier par décision, sections « Décision » et « Pourquoi »
- [X] T121 Rédiger `PROJET.md` : état, carte du code, invariants à ne pas casser (constitution I et II, data-model.md « Règles transverses »), versions épinglées, et matrice FR ⇒ fichier de test couvrant FR-001 à FR-043
- [X] T122 Dérouler quickstart.md § 3 et § 4 et corriger tout écart

---

## Phase 11: Mise en production

**Purpose**: servir `https://dateplanner.laserit.fr` (FR-035) et remplir les obligations
d'exploitation de la constitution (surveillance extérieure, sauvegardes hors machine,
restauration éprouvée). Gestes d'exploitation faits par l'exploitant (accès SSH, Proxmox,
OVH, Google Cloud), en suivant `README.md` et `deploy.md`.

- [X] T123 Créer la VM 102 `dateplanner` sur l'hôte Proxmox (Debian stable, 2 vCPU, 2 Go de mémoire, 20 Go de disque), bail DHCP statique `192.168.1.53` sur la box, accès `admin` par clé SSH ; y installer Node.js 22, PostgreSQL 17 et `ufw` (SSH depuis le réseau local, port 3000 depuis `192.168.1.51` seulement), selon `README.md`
- [ ] T124 Sur la VM : rôle et base PostgreSQL `dateplanner`, compte système `dateplanner`, dépôt cloné dans `/opt/dateplanner`, fichier `/opt/dateplanner/.env` (mode 600) écrit depuis `.env.example` : `NODE_ENV=production`, `NEXT_PUBLIC_SITE_URL=https://dateplanner.laserit.fr`, `APP_SECRET` et `CRON_SECRET` aléatoires, `EMAIL_DRIVER=gmail`, `SMTP_USER=notificationslaserit@gmail.com` et son mot de passe d'application, `EMAIL_FROM`
- [ ] T125 [P] Créer le client OAuth Google (même projet Google Cloud que laserit.fr, URI de retour `https://dateplanner.laserit.fr/api/connexion/google/retour`) et reporter `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` dans `/opt/dateplanner/.env`
- [X] T126 [P] Ajouter dans la zone DNS OVH de `laserit.fr` l'entrée CNAME `dateplanner` ⇒ `laserit.fr.` (procédure de `README.md`) ; vérifier que `Resolve-DnsName dateplanner.laserit.fr` renvoie `<IP publique>`
- [X] T127 Copier `deploy/traefik/dateplanner.yml` dans `/etc/traefik/dynamic/` de la VM proxy (`192.168.1.51`) ; vérifier que Traefik obtient le certificat Let's Encrypt de `dateplanner.laserit.fr` et que `http://` est redirigé
- [X] T128 Installer sur la VM les unités de `deploy/` (`dateplanner.service` et son complément `dateplanner-proxy-distant.conf`, `dateplanner-maintenance.timer`, `dateplanner-backup.timer`, `journald-dateplanner.conf`) puis `systemctl enable --now` ; `systemctl list-timers` montre les deux minuteurs
- [ ] T129 Publier la version `v0.1.0` (pull request de version, tag annoté, release) puis la déployer selon `deploy.md` : `qm snapshot 102 avant_v0_1_0`, `git checkout --detach v0.1.0`, `npm ci`, `npx prisma migrate deploy`, `npm run build`, redémarrage de `dateplanner.service`
- [ ] T130 Brancher une surveillance extérieure de `https://dateplanner.laserit.fr/api/sante` (service tiers choisi par l'exploitant, contrôle toutes les 5 min, alerte par email) et consigner le choix dans `docs/decisions/` et `README.md`
- [ ] T131 Mettre en place la copie des sauvegardes hors de la VM (autre machine ou autre disque, planifiée) puis éprouver une restauration complète avec `scripts/restore.sh` sur une base vierge ; consigner la date et le résultat dans `PROJET.md`
- [ ] T132 Dérouler quickstart.md § 5 sur la production et corriger tout écart

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** : aucune dépendance
- **Foundational (Phase 2)** : après Setup ; bloque toutes les user stories
- **User Stories (Phases 3 à 9)** : après Foundational
- **Polish (Phase 10)** : après les stories voulues ; T113 dépend de T036 et T034, T119 de T117
- **Mise en production (Phase 11)** : après T117 à T119 et au moins le MVP (US1 à US3) ; T123 ⇒ T124 ⇒ T128 ⇒ T129 ; T125 et T126 en parallèle de T123 ; T127 après T126 ; T130 et T131 après T129 ; T132 en dernier

### User Story Dependencies

- **US1 (P1)** : après Foundational ; crée la page `/s/{publicId}` minimale
- **US2 (P2)** : s'appuie sur la page `/s/{publicId}` de T058 ; ses tests d'intégration n'ont besoin que des fabriques (T017)
- **US3 (P3)** : s'appuie sur les actions de réponse de US2 (T064) pour publier ; la synthèse seule se teste avec les fabriques
- **US4 (P4)** : après Foundational et les pages de connexion de US1 (T053)
- **US5 (P5)** : s'appuie sur US1 (création), US2 (réponses, T063) et US3 (`retainedDay` de T072, publication)
- **US6 (P6)** et **US7 (P7)** : après Foundational seulement, indépendantes du reste

### Within Each User Story

- Tests écrits d'abord, en échec avant l'implémentation
- Modules purs, puis services serveur, puis actions, puis pages
- Fichiers partagés modifiés en séquence : `src/app/s/[publicId]/page.tsx` (T058 ⇒ T066 ⇒ T077 ⇒ T100), `src/app/s/[publicId]/actions.ts` (T064 ⇒ T075 ⇒ T098), `src/server/polls/read.ts` (T058 ⇒ T066 ⇒ T071 ⇒ T101), `src/server/notifications/templates.ts` (T034 ⇒ T050 ⇒ T096 ⇒ T113), `src/components/date-picker.tsx` (T042 ⇒ T072), `prisma/schema.prisma` (T011 ⇒ T015)

### Parallel Opportunities

- Setup : T002 à T009 en parallèle après T001
- Foundational : T010 d'emblée ; T018 à T027, T029, T030, T032 à T034, T040, T041 en parallèle une fois le schéma (T011 à T017) posé ; T039 dès T037 et T038 faits
- Toutes les tâches de test marquées [P] d'une même story en parallèle
- US6 et US7 en parallèle de US1 à US5
- Polish : T111, T112, T114 à T120 en parallèle

---

## Parallel Example: User Story 1

```bash
# Tests de US1 ensemble :
Task: "T043 tests/unit/password-rules.test.ts"
Task: "T044 tests/integration/auth-service.test.ts"
Task: "T045 tests/integration/password-reset.test.ts"
Task: "T046 tests/integration/create-poll.test.ts"
Task: "T047 e2e/create-poll.spec.ts"

# Puis les briques indépendantes :
Task: "T048 src/lib/password-rules.ts"
Task: "T052 src/components/password-input.tsx"
Task: "T057 src/components/copy-link.tsx"
```

## Parallel Example: User Story 3

```bash
Task: "T067 tests/unit/availability.test.ts"
Task: "T068 tests/integration/live-stream.test.ts"
Task: "T069 e2e/live-updates.spec.ts"
Task: "T070 src/lib/availability.ts"
Task: "T073 src/app/s/[publicId]/_sections/availability-list.tsx"
```

## Parallel Example: User Story 5

```bash
Task: "T085 tests/unit/poll-state.test.ts"
Task: "T086 tests/unit/digest.test.ts"
Task: "T087 tests/unit/signed-link.test.ts"
Task: "T091 src/lib/poll-state.ts"
Task: "T092 src/lib/digest.ts"
Task: "T093 src/lib/signed-link.ts"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) puis Phase 2 (Foundational)
2. US1, puis US2, puis US3 : le parcours minimal de la spec, créer ⇒ répondre ⇒ voir qui est disponible
3. **STOP and VALIDATE** : scénarios 4 à 11 de quickstart.md
4. Premier déploiement : Polish T117 à T119, puis Phase 11 (Mise en production)

### Incremental Delivery

1. Setup + Foundational ⇒ socle
2. US1 ⇒ sondages créés et partagés
3. US2 + US3 ⇒ MVP utile, déployable
4. US4 ⇒ connexion Google
5. US5 ⇒ gestion, clôture, emails
6. US6 + US7 ⇒ accueil et thème (réalisables en parallèle dès la fin du socle)
7. Polish ⇒ compte, conformité, conservation, exploitation, documentation
8. Mise en production ⇒ VM, DNS, Traefik, version taggée, surveillance, restauration éprouvée

Chaque story passe par sa propre branche `feat/…` et sa pull request, contrôles de CI verts.

---

## Notes

- [P] = fichiers différents, aucune dépendance inachevée
- Chaque tâche de test cite les FR qu'elle couvre : la matrice de T121 s'en déduit
- Commiter après chaque tâche ou groupe logique
- S'arrêter à chaque checkpoint pour valider la story seule
