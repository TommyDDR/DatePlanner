# DatePlanner - état du projet

Fiche de reprise : où en est le projet, où vit chaque chose, ce qu'il ne faut
pas casser. L'installation et l'exploitation sont dans `README.md`, les mises à
jour dans `deploy.md`, les décisions dans `docs/decisions/`, la spécification
dans `specs/001-date-poll/`.

---

## 1. État

- **Fonctionnalité 001, sondages de dates** : les sept user stories sont
  livrées (création, réponse avec ou sans compte, synthèse en direct, connexion
  Google, gestion par le créateur, page d'accueil, thèmes), avec la page
  compte, les pages légales, la conservation automatique, les fichiers
  d'exploitation et la documentation.
- **Mise en production** (30 septembre 2026) : VM 102 créée et
  provisionnée, CNAME OVH, route Traefik et certificat Let's Encrypt, unités
  systemd installées, service en ligne sur `https://dateplanner.laserit.fr`,
  sauvegarde nocturne éprouvée une fois. Restent : le client OAuth Google et
  le mot de passe d'application Gmail dans `/opt/dateplanner/.env`, la
  surveillance extérieure, la copie des sauvegardes hors de la VM.
- **Restauration éprouvée** : pas encore. Date et résultat à consigner ici
  après le premier essai de `scripts/restore.sh` sur une base vierge.

---

## 2. Contrôles avant toute fusion

```bash
npm audit --omit=dev
npm run typecheck
npm run lint
npm test          # Vitest : unitaires + intégration contre dateplanner_test
npm run build
npm run e2e       # Playwright + axe
```

L'intégration continue (`.github/workflows/ci.yml`) les rejoue sur chaque
poussée, contre un PostgreSQL 17 en service.

---

## 3. Carte du code

```
src/
  proxy.ts                 nonce et CSP par requête, 404 des liens mal formés, cookie de session prolongé
  config/                  valeurs déclarées UNE fois
    identity.ts            nom, domaine ; éditeur et hébergeur lus dans .env
    limits.ts              seaux anti-flood, session, appareil, flux, bornes d'un sondage, résumé, file
    retention.ts           durées de conservation (lues par la maintenance ET la politique)
  lib/                     modules PURS, sans base ni horloge implicite
    poll-rules.ts          jours valides, réponse acceptable, retrait d'un jour
    poll-state.ts          clore, rouvrir, dates retenues
    availability.ts        synthèse : votes et votants par jour
    digest.ts              contenu du résumé au créateur
    date-picker.ts         grille, plages, semaines, clavier du calendrier
    paris-day.ts           jours `AAAA-MM-JJ`, « aujourd'hui » à Paris
    validation.ts          schémas Zod des formulaires
    csp.ts, https-redirect.ts, safe-redirect.ts, signed-link.ts, theme.ts, …
  server/
    db/client.ts           Prisma (adaptateur pg)
    auth/                  sessions, mots de passe, service de connexion, Google, appareil, compte
    polls/                 création, lecture, réponses, édition, états, verrou du créateur
    events/bus.ts          LISTEN/NOTIFY vers les flux SSE
    notifications/         file d'envoi, transport, composeurs (réinitialisation, résumé, dates retenues, inactivité)
    ratelimit/             fenêtres glissantes en base
    maintenance/           passage de maintenance et conservation
  app/                     pages et routes (contracts/pages.md, contracts/http-api.md)
    s/[publicId]/          page d'un sondage, ses actions, ses sections (réponse, synthèse, créateur)
    api/                   flux, maintenance, santé, retour Google, désactivation du résumé
  components/              calendrier, thème, formulaires, démonstration de l'accueil
prisma/                    schéma et migration (contraintes écrites à la main)
tests/unit, tests/integration, e2e/
deploy/, scripts/          unités systemd, Traefik, journald ; sauvegarde et restauration
```

---

## 4. Invariants à ne pas casser

Sécurité (constitution I) :

- Le contrôle d'accès est DANS la requête : chaque écriture du créateur porte
  `WHERE owner_id = :session` ; celle d'un répondant, `user_id = :session`
  connecté, `device_token_hash = :hash(cookie)` sans session. Zéro ligne
  touchée répond « introuvable », jamais « interdit ».
- Toute saisie est échappée au point de sortie : React dans les pages,
  `escapeHtml` dans la branche HTML des emails. Le seul HTML brut du code est
  le script du thème, une constante (`tests/unit/csp-source.test.ts`).
- CSP à nonce, sans `'unsafe-inline'` pour les scripts ; HTTPS imposé en
  production ; cookies `HttpOnly`, `Secure` en production.
- Jetons de session, d'appareil et de réinitialisation : seule leur empreinte
  SHA-256 est en base.
- Google ne rattache un compte que sur une adresse vérifiée, et le reconnaît
  ensuite par `googleId`. Rattacher un compte jamais prouvé efface son mot de
  passe et ferme ses sessions.
- Aucun secret versionné (`tests/unit/repository-hygiene.test.ts`).

Le serveur décide (constitution II) :

- Jours proposés, jours passés, sondage clos, compte exigé, retrait d'un jour
  voté : l'interface masque, le serveur refuse, dans la transaction.
- Réponses sous `SELECT … FOR SHARE` du sondage, opérations du créateur sous
  `FOR UPDATE` : une clôture ou un retrait de jour ne croise jamais un vote.
- Les clés `vote → poll_day` et « date retenue → jour » sont différées
  (`docs/decisions/027-cles-etrangeres-differees.md`) : un jour voté ou
  retenu ne disparaît pas seul, un sondage ou un compte supprimé emporte tout.
  Une date retenue tient aussi à l'état clos du sondage, par une clé vers
  `poll(id, status)` (`docs/decisions/039-plusieurs-dates-retenues.md`).
- Le flux en direct ne transporte que `{ kind, at }` : la page se relit
  avec ses propres contrôles d'accès.

Données (constitution IV) :

- Les durées de conservation vivent dans `src/config/retention.ts`, lues par
  la maintenance ET par la politique de confidentialité ; un test confronte le
  texte rendu à ces valeurs.
- Un compte n'est supprimé pour inactivité que 30 jours après l'ENVOI de son
  avertissement (`docs/decisions/029-avertissement-a-l-envoi.md`).
- Un email n'est jamais envoyé dans une transaction métier : mis en file,
  composé au départ, retenté.

Apparence :

- Les jetons de laserit.fr restent identiques (`tests/unit/design-tokens.test.ts`) ;
  ceux propres à DatePlanner (`--color-text-subtle`, `--color-danger`) portent
  le contraste exigé par axe dans les deux thèmes.

---

## 5. Versions épinglées

`save-exact=true` : chaque version est exacte, identique à laserit.fr quand la
dépendance y existe.

| Dépendance | Version | | Dépendance de développement | Version |
|---|---|---|---|---|
| next | 16.3.4 | | typescript | 5.9.3 |
| react, react-dom | 19.2.8 | | eslint | 9.39.5 |
| @prisma/client, @prisma/adapter-pg | 7.10.0 | | eslint-config-next | 16.3.4 |
| pg | 8.23.0 | | prisma | 7.10.0 |
| zod | 4.5.4 | | tailwindcss, @tailwindcss/postcss | 4.3.3 |
| @node-rs/argon2 | 2.2.0 | | vitest | 4.1.11 |
| nodemailer | 10.0.12 | | @playwright/test | 1.63.0 |
| | | | @axe-core/playwright | 4.13.0 |

TypeScript reste en 5.9 tant que `typescript-eslint` ne suit pas la 7.

---

## 6. Exigences et tests

Chaque exigence de `specs/001-date-poll/spec.md` et le fichier qui la vérifie.

| FR | Objet | Tests |
|---|---|---|
| FR-001 | compte local | `tests/integration/auth-service.test.ts` |
| FR-002 | règle du mot de passe | `tests/unit/password-rules.test.ts` |
| FR-003 | connexion Google, rattachement | `tests/integration/google-login.test.ts`, `tests/unit/google-token.test.ts`, `tests/integration/google-routes.test.ts` |
| FR-004 | réinitialisation | `tests/integration/password-reset.test.ts` |
| FR-005 | échecs indifférenciés, freinage | `tests/integration/auth-service.test.ts`, `tests/integration/ratelimit.test.ts` |
| FR-006 | suppression du compte | `tests/integration/account.test.ts` |
| FR-007 | création réservée aux comptes | `tests/integration/create-poll.test.ts`, `e2e/create-poll.spec.ts` |
| FR-008 | titre, description, au moins un jour | `tests/unit/poll-rules.test.ts`, `tests/unit/validation.test.ts`, `tests/integration/create-poll.test.ts` |
| FR-009 | calendrier de laserit.fr | `tests/unit/date-picker.test.ts`, `e2e/create-poll.spec.ts` |
| FR-010 | pas de jour passé à la création | `tests/unit/poll-rules.test.ts`, `tests/integration/create-poll.test.ts`, `e2e/create-poll.spec.ts` |
| FR-011 | au plus 366 jours | `tests/unit/poll-rules.test.ts`, `tests/integration/create-poll.test.ts`, `tests/integration/poll-owner.test.ts` |
| FR-012 | lien impossible à deviner, copie | `tests/integration/create-poll.test.ts`, `e2e/create-poll.spec.ts` |
| FR-013 | consulter et répondre par le lien | `tests/integration/responses.test.ts`, `e2e/respond.spec.ts` |
| FR-014 | compte ou pseudo | `tests/integration/responses.test.ts`, `e2e/respond.spec.ts` |
| FR-015 | seuls les jours proposés à venir | `tests/unit/poll-rules.test.ts`, `e2e/respond.spec.ts` |
| FR-016 | refus serveur d'un jour illégitime | `tests/integration/responses.test.ts` |
| FR-017 | au moins un jour | `tests/unit/poll-rules.test.ts`, `tests/integration/responses.test.ts` |
| FR-018 | une réponse par compte ou appareil | `tests/integration/responses.test.ts`, `tests/integration/schema-constraints.test.ts` |
| FR-019 | modifier, retirer sa réponse | `tests/integration/responses.test.ts`, `e2e/respond.spec.ts` |
| FR-020 | pastilles de votes | `tests/unit/availability.test.ts`, `e2e/live-updates.spec.ts` |
| FR-021 | votants au survol et au focus | `tests/unit/availability.test.ts`, `e2e/live-updates.spec.ts` |
| FR-022 | synthèse visible par tous | `e2e/live-updates.spec.ts`, `e2e/respond.spec.ts` |
| FR-023 | direct sans rechargement | `tests/integration/live-stream.test.ts`, `tests/integration/bus.test.ts`, `e2e/live-updates.spec.ts` |
| FR-024 | liste « Mes sondages » | `tests/integration/poll-owner.test.ts` |
| FR-025 | droits du seul créateur | `tests/integration/poll-owner.test.ts`, `e2e/manage-poll.spec.ts` |
| FR-026 | clore, rouvrir, dates retenues | `tests/unit/poll-state.test.ts`, `tests/integration/poll-owner.test.ts`, `e2e/manage-poll.spec.ts` |
| FR-027 | ajouter des jours, retirer un jour sans vote | `tests/integration/poll-owner.test.ts`, `tests/integration/schema-constraints.test.ts` |
| FR-028 | refus = introuvable | `tests/integration/poll-owner.test.ts`, `e2e/manage-poll.spec.ts` |
| FR-029 | deux thèmes, système puis choix | `e2e/theme.spec.ts`, `tests/unit/theme.test.ts` |
| FR-030 | pas de flash | `e2e/theme.spec.ts` |
| FR-031 | identité de laserit.fr | `tests/unit/design-tokens.test.ts`, `e2e/theme.spec.ts` |
| FR-032 | accueil : démonstration, étapes, appel | `e2e/landing.spec.ts` |
| FR-033 | réduire les animations | `e2e/landing.spec.ts`, `e2e/accessibility.spec.ts` |
| FR-034 | téléphone et clavier | `e2e/accessibility.spec.ts`, `e2e/landing.spec.ts`, `e2e/live-updates.spec.ts` |
| FR-035 | HTTPS seul | `tests/unit/https-redirect.test.ts`, `tests/integration/security.test.ts`, `tests/unit/csp-source.test.ts` |
| FR-036 | mentions légales, confidentialité | `tests/unit/privacy-policy.test.ts`, `tests/integration/retention.test.ts` |
| FR-037 | sondages hors index | `tests/integration/security.test.ts` |
| FR-038 | limites de création | `tests/integration/create-poll.test.ts`, `tests/integration/responses.test.ts`, `tests/integration/ratelimit.test.ts` |
| FR-039 | suppression d'une réponse par le créateur | `tests/integration/poll-owner.test.ts`, `e2e/manage-poll.spec.ts` |
| FR-040 | compte exigé | `tests/integration/create-poll.test.ts`, `tests/integration/poll-owner.test.ts`, `tests/integration/responses.test.ts`, `e2e/respond.spec.ts` |
| FR-041 | résumé au créateur, désactivation | `tests/integration/notifications.test.ts`, `tests/unit/digest.test.ts`, `tests/unit/signed-link.test.ts` |
| FR-042 | annonce des dates retenues | `tests/integration/notifications.test.ts` |
| FR-043 | échec d'envoi sans effet sur l'action | `tests/integration/outbox.test.ts`, `tests/integration/notifications.test.ts` |
| FR-045 | plusieurs dates retenues | `tests/unit/poll-state.test.ts`, `tests/integration/poll-owner.test.ts`, `tests/integration/create-poll.test.ts`, `tests/integration/schema-constraints.test.ts`, `e2e/manage-poll.spec.ts` |

Critères de succès mesurés : SC-003 (`e2e/live-updates.spec.ts`), SC-004
(`tests/integration/responses.test.ts`), SC-005
(`tests/integration/performance.test.ts`, `e2e/performance.spec.ts`), SC-006
(`e2e/landing.spec.ts`), SC-007 (`e2e/theme.spec.ts`), SC-009
(`e2e/accessibility.spec.ts`).
