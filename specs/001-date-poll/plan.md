# Implementation Plan: DatePlanner — sondages de dates

**Branch**: `feat/planning-rdv` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-date-poll/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Service web autonome, servi sur `https://dateplanner.laserit.fr`, où un utilisateur inscrit
(compte local ou Google) crée un sondage de dates — titre, description, jours proposés choisis
dans le calendrier de laserit.fr — et partage un lien impossible à deviner. N'importe qui
répond, connecté ou sous un pseudo reconnu par un cookie d'appareil ; les jours non proposés
sont inertes et refusés par le serveur. Chaque jour voté porte une pastille et la liste de ses
votants, mise à jour en direct chez tous par SSE. Le créateur modère (ajout de jours, retrait
d'un jour sans vote, suppression de réponses, compte exigé), clôt en désignant la date
retenue, et reçoit un résumé groupé des nouvelles réponses ; les répondants connectés sont
prévenus de la date retenue.

Approche : reprendre la pile, les invariants de sécurité, le calendrier, le thème, le flux en
direct et la file d'emails de laserit.fr (Next.js 16, Prisma 7, PostgreSQL 17), dans une VM
dédiée derrière le proxy Traefik existant. Détails : [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.9.3 (épinglé), Node.js 22 LTS

**Primary Dependencies**: Next.js 16.3.4 (App Router, Server Actions), React 19.2.8, Tailwind CSS
4.3.3, Prisma 7.10.0 + `@prisma/adapter-pg` 7.10.0 + `pg` 8.23.0, Zod 4.5.4, `@node-rs/argon2`
2.2.0, Nodemailer 10.0.12 — versions exactes, celles de laserit.fr (R1)

**Storage**: PostgreSQL 17 local à la VM, base `dateplanner` ; jours en `DATE` (R3, R17)

**Testing**: Vitest 4.1.11 (modules purs et intégration contre un vrai PostgreSQL 17), Playwright
1.63.0 (Chromium) avec `@axe-core/playwright` (version exacte fixée en T001, seule dépendance
absente de laserit.fr, justifiée en R16), GitHub Actions (R16)

**Target Platform**: serveur Linux (VM Debian sous Proxmox) derrière Traefik ; navigateurs
récents, ordinateur et téléphone

**Project Type**: application web (rendu serveur + actions serveur, un seul déployable)

**Performance Goals**: mise à jour en direct < 5 s (SC-003) ; sondage de 60 jours et 100
répondants affiché complet < 2 s en 4G (SC-005) ; contenu principal de l'accueil < 2,5 s en 4G
(SC-006)

**Constraints**: HTTPS seul ; CSP à nonce sans `'unsafe-inline'` ; aucun script ni traceur
tiers ; au plus 6 flux SSE par adresse ; tas Node borné (VM modeste) ; interface en français

**Scale/Scope**: usage personnel à associatif — dizaines de sondages par jour, quelques
centaines de répondants par sondage au plus, une centaine de flux ouverts simultanément ;
12 pages, 20 actions serveur, 6 routes HTTP, 4 modèles d'email

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 (`.specify/memory/constitution.md`).

| Principe / règle | Exigence vérifiée | Avant recherche | Après conception — preuve |
|---|---|---|---|
| I. Sécurité par construction | accès filtré dans la requête, « introuvable » plutôt qu'« interdit » | ✅ | chaque écriture porte `owner_id` / `user_id` / `device_token_hash` dans son `WHERE` ([data-model](data-model.md#règles-transverses), [server-actions](contracts/server-actions.md)) |
| | saisies échappées à la sortie | ✅ | pages React (échappement natif, aucun HTML brut de saisie), emails échappés ([emails](contracts/emails.md)) |
| | HTTPS, cookies `Secure`/`HttpOnly`, CSP à nonce | ✅ | R14, [cookies](contracts/http-api.md#cookies) |
| | connexion indifférenciée, freinée | ✅ | `AUTH_FAILED` unique, hachage factice, verrou, seaux (R4, R11) |
| | Google : adresse vérifiée, reconnaissance par identifiant | ✅ | R5, plus la protection contre la pré-appropriation propre à ce service |
| | aucun secret versionné | ✅ | `.env` hors dépôt, `.env.example` sans valeur, `EnvironmentFile` (R19) |
| II. Le serveur décide | règles d'interface revérifiées | ✅ | jours, clôture, compte exigé, retrait de jour revérifiés en transaction ([data-model: Vote, PollDay](data-model.md)) |
| | écritures concurrentes gardées | ✅ | écritures conditionnelles, `NO ACTION` sur `Vote → PollDay` (compatible avec les cascades), index d'unicité des réponses et du résumé en attente |
| | le direct ne transporte rien de lisible | ✅ | événements `{ kind, at }` seulement, relecture par rendu serveur (R8) |
| III. Logique pure, testée | règles dans des modules purs | ✅ | `lib/date-picker`, `lib/poll-rules`, `lib/poll-state`, `lib/digest`, `lib/availability`, `lib/paris-day` ; durées dans `config/retention` |
| | chaque FR et invariant testé, vraie base, bout en bout | ✅ | R16 ; test des jetons visuels (FR-031), test d'hygiène du dépôt (aucun secret versionné) ; matrice FR → test exigée par les tâches |
| IV. Données minimales | pas de traceur, cookies nécessaires seulement | ✅ | trois cookies nécessaires, thème en stockage local, pas de captcha tiers (R6, R11) |
| | durées déclarées et appliquées | ✅ | `config/retention`, maintenance, politique de confidentialité confrontée par un test (R15, R18) |
| | suppression du compte en cascade | ✅ | [data-model: User](data-model.md#user-utilisateur) |
| V. Accessible, cohérent, français | clavier, contraste, mouvement réduit, thème sans flash, identité laserit.fr | ✅ | R9 (infobulle au focus, liste visible), R12, R13 ; contrôle d'accessibilité Playwright |
| VI. Sobriété | versions exactes, audit à 0 | ✅ | R1, `.npmrc`, CI |
| | briques éprouvées, dépendances justifiées | ✅ | une seule dépendance hors pile laserit.fr, de développement : `@axe-core/playwright`, justifiée en R16 ; trois dépendances de laserit.fr retirées ; `@types/nodemailer` inutile (types fournis par Nodemailer 10) |
| | rien hors spec | ✅ | aucune fonction ajoutée ; notifications et modération issues des clarifications |
| Exploitation | autonomie, VM dédiée derrière le proxy, HTTPS, tag + snapshot, santé surveillée de l'extérieur, sauvegardes hors machine et restauration éprouvée, SMTP fournisseur, journaux bornés | ✅ | R2, R10, R15, R19, phase « Mise en production » de tasks.md, [quickstart § 5](quickstart.md#5-vérifications-après-mise-en-production) |
| Flux de travail | branche dédiée, PR, cycle Spec Kit, CI verte, décisions consignées, `PROJET.md` | ✅ | branche `feat/planning-rdv` ; CI, `docs/decisions/`, `PROJET.md` créés dès la première tâche |

**Résultat** : aucune violation, avant comme après la conception. La section Complexity
Tracking reste vide.

## Project Structure

### Documentation (this feature)

```text
specs/001-date-poll/
├── plan.md              # ce fichier
├── research.md          # phase 0 : décisions techniques R1–R19
├── data-model.md        # phase 1 : entités, contraintes, transitions
├── quickstart.md        # phase 1 : installation et scénarios de validation
├── contracts/
│   ├── pages.md         # adresses, accès, contenu
│   ├── server-actions.md# mutations : entrées, résultats, erreurs
│   ├── http-api.md      # Google, flux SSE, maintenance, santé, cookies
│   └── emails.md        # modèles, déclencheurs, règles d'envoi
├── checklists/
│   └── requirements.md
└── tasks.md             # phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── layout.tsx                 # polices, nonce, script de thème, en-tête, pied
│   ├── globals.css                # jetons visuels repris de laserit.fr
│   ├── page.tsx                   # accueil : démonstration, étapes, appel à l'action
│   ├── (auth)/                    # connexion, inscription, mot-de-passe-oublie, reinitialisation
│   ├── nouveau/                   # création d'un sondage
│   ├── mes-sondages/              # liste des sondages du compte
│   ├── s/[publicId]/              # page du sondage
│   │   └── _sections/             # calendrier-synthèse, formulaire de réponse, panneau du créateur, liste des disponibilités
│   ├── compte/                    # profil, suppression du compte
│   ├── notifications/resume/desactiver/
│   ├── mentions-legales/  confidentialite/
│   ├── api/
│   │   ├── connexion/google/      # départ et retour
│   │   ├── s/[publicId]/flux/     # SSE
│   │   ├── notifications/resume/desactiver/
│   │   ├── maintenance/
│   │   └── sante/
│   ├── robots.ts  sitemap.ts  not-found.tsx  error.tsx  global-error.tsx
├── components/                    # date-picker (porté + pastilles, infobulle), theme-*, csp-nonce,
│                                  # live-poll (abonnement SSE), copy-link, landing-demo, password-input
├── config/                        # limits (seaux, sessions, flux), retention, identity (mentions légales)
├── lib/                           # modules PURS : date-picker, paris-day, poll-rules, poll-state,
│                                  # digest, availability, validation (Zod), action-result,
│                                  # password-rules, session-cookie, safe-redirect, csp,
│                                  # https-redirect, theme, signed-link, google-signin-notice
├── server/
│   ├── db/                        # client Prisma
│   ├── auth/                      # password, session, service, account, google, google-handshake, device
│   ├── polls/                     # create, edit, state, responses, read
│   ├── events/                    # bus LISTEN/NOTIFY
│   ├── notifications/             # outbox, transport, templates, digest
│   ├── ratelimit/
│   └── maintenance/
└── proxy.ts                       # nonce + CSP, 404 précoces
prisma/
├── schema.prisma
└── migrations/
tests/                             # Vitest : unit/ (modules purs, hygiène, jetons), integration/ (vraie base),
│                                  # helpers/, fixtures/ (jetons de laserit.fr)
e2e/                               # Playwright
deploy/
├── dateplanner.service  dateplanner-proxy-distant.conf  journald-dateplanner.conf
├── dateplanner-maintenance.service/.timer  dateplanner-backup.service/.timer
└── traefik/dateplanner.yml        # à copier dans /etc/traefik/dynamic/ de la VM proxy
scripts/                           # backup.sh, restore.sh
docs/decisions/                    # NNN-titre.md : Décision / Pourquoi
.github/workflows/ci.yml
PROJET.md  README.md  deploy.md  .env.example  .npmrc
```

**Structure Decision**: un seul projet Next.js à la racine, calqué sur laserit.fr : pages et
routes dans `src/app`, règles de décision dans `src/lib` (modules purs, testés en isolation),
accès aux données et effets dans `src/server`, fichiers d'exploitation dans `deploy/`. Aucune
séparation front/back : les actions serveur et le rendu serveur partagent les schémas Zod, et
un seul déployable suffit à l'échelle visée.

## Complexity Tracking

Aucune violation de la constitution à justifier.
