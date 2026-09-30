# Phase 0 — Recherche : DatePlanner, sondages de dates

**Spec** : [spec.md](spec.md) · **Plan** : [plan.md](plan.md) · **Date** : 2026-09-30

Référence constante : le site laserit.fr (dépôt `SiteLasercut`), dont la spec demande de
reprendre le calendrier, l'identité visuelle et l'infrastructure, et dont la constitution
(principe VI) demande de préférer les briques déjà éprouvées.

---

## R1 — Pile technique

- **Decision** : application web unique en TypeScript 5.9.3 sur Node.js 22 LTS, Next.js 16.3.4
  (App Router, composants serveur, Server Actions), React 19.2.8, Tailwind CSS 4.3.3, Prisma
  7.10.0 avec l'adaptateur `@prisma/adapter-pg` et `pg` 8.23.0, PostgreSQL 17, Zod 4.5.4 pour
  la validation partagée, `@node-rs/argon2` 2.2.0 pour les mots de passe, Nodemailer 10.0.12
  pour l'envoi SMTP. Tests : Vitest 4.1.11, Playwright 1.63.0. Versions **exactes**, identiques
  à celles de laserit.fr, `save-exact=true` dans `.npmrc`.
- **Rationale** : ces versions tournent en production sur la même infrastructure, avec leurs
  pièges déjà documentés (Prisma 7 : URL hors du schéma, `dotenv` explicite ; TypeScript
  épinglé en 5.9 tant que `typescript-eslint` ne suit pas la 7 ; ESLint 9). Reprendre la même
  pile rend le calendrier, le thème, les sessions, le flux en direct et la file d'emails
  transposables presque tels quels.
- **Alternatives considered** : SvelteKit ou Remix (moins de code réutilisable, nouvelle pile à
  maintenir seul) ; un backend séparé (API + SPA) — deux déploiements pour un service de cette
  taille, rejeté (principe VI).
- **Dépendances écartées de laserit.fr** : `sharp`, `dxf-parser`, `fast-xml-parser` (rien à
  analyser ici). Pas de bibliothèque d'animation, de composants ou de dates : la démonstration
  de l'accueil est en SVG et CSS, les dates sont des chaînes `AAAA-MM-JJ` (R9).

## R2 — Topologie d'hébergement

- **Decision** : une **VM Proxmox dédiée** `dateplanner` (proposée : VM 102, `192.168.1.53`,
  bail DHCP statique sur la box), Debian, portant Node 22 et son propre PostgreSQL 17. La VM
  proxy existante (`192.168.1.51`, Traefik + CrowdSec) reçoit un second fichier dynamique
  `dateplanner.yml` : `Host(\`dateplanner.laserit.fr\`)` vers `http://192.168.1.53:3000`,
  certificat Let's Encrypt par défi HTTP. Le pare-feu de la VM n'ouvre le port 3000 qu'à la VM
  proxy. DNS : entrée CNAME `dateplanner` vers `laserit.fr.` dans la zone OVH.
- **Rationale** : constitution (« Autonomie », « Hébergement ») : base, comptes, cycle de
  déploiement et snapshot propres, sans risque de faire tomber laserit.fr par une mise à jour.
  Le proxy existant fait déjà les trois réglages indispensables (en-têtes de confiance, délai
  de lecture, SSE sans tampon) et CrowdSec lit le même journal d'accès : le nouveau domaine est
  protégé sans configuration supplémentaire. Le CNAME suit l'adresse publique de `laserit.fr`
  (`<IP publique>`) si elle change ; la zone n'a ni `AAAA` ni `CAA` qui gênerait Let's Encrypt.
- **Alternatives considered** : même VM que laserit.fr avec une seconde base — moins de
  ressources, mais snapshot et redémarrages partagés, rejeté ; conteneurs Docker — nouvelle
  brique d'exploitation absente de l'infrastructure actuelle, rejeté (principe VI).

## R3 — Base de données et accès

- **Decision** : PostgreSQL 17 local à la VM, base `dateplanner`, rôle applicatif sans droit
  de création de base ; Prisma 7 (schéma, migrations versionnées, `prisma migrate deploy` au
  déploiement). Les jours sont des colonnes `DATE`, jamais des horodatages.
- **Rationale** : même moteur qu'en test et en intégration continue (principe III). `DATE`
  supprime toute question de fuseau à l'enregistrement.
- **Alternatives considered** : SQLite — pas de `LISTEN/NOTIFY` pour le direct (R8), tests
  d'intégration divergents de laserit.fr, rejeté.

## R4 — Comptes locaux et sessions

- **Decision** :
  - mot de passe haché en **argon2id** (`@node-rs/argon2`) ; règle CNIL de laserit.fr
    (10 caractères, minuscule, majuscule, chiffre, caractère spécial) dans un module pur
    partagé par le schéma et l'indication sous le champ ;
  - sessions en base : cookie `HttpOnly`, `Secure` en production, `SameSite=Lax`, jeton
    aléatoire de 256 bits dont seule l'empreinte SHA-256 est stockée ; échéance glissante de
    30 jours, plafond absolu de 90 jours ;
  - connexion : message d'échec unique, hachage factice pour un compte inconnu, verrou
    progressif par compte, seaux par adresse ;
  - inscription sur une adresse déjà inscrite : le mot de passe saisi est présenté à la
    connexion (juste, il connecte ; faux, message générique) — pas d'oracle gratuit ;
  - réinitialisation du mot de passe : jeton à usage unique (empreinte en base, 1 h), toutes
    les sessions fermées après réinitialisation ;
  - **pas de vérification d'adresse préalable** (hypothèse de la spec), mais une adresse est
    marquée « prouvée » dès qu'un lien envoyé à cette adresse a été utilisé (réinitialisation)
    ou que Google l'a vérifiée.
- **Rationale** : reprise des invariants de sécurité de laserit.fr (constitution I). Le
  hachage rapide du jeton de session suffit : il est à haute entropie, rien à forcer.
- **Alternatives considered** : JWT sans état — révocation impossible (déconnexion de tous les
  appareils après réinitialisation), rejeté ; vérification obligatoire de l'adresse — friction
  refusée par la spec.

## R5 — Connexion Google

- **Decision** : OAuth 2.0 / OpenID Connect, code d'autorisation avec **PKCE**, reprise de
  `server/auth/google.ts` et `google-handshake.ts` de laserit.fr : `state`, vérificateur PKCE
  et destination de retour scellés dans un cookie signé `HttpOnly` effacé dans tous les cas ;
  code échangé par le serveur ; jeton d'identité accepté seulement si `aud` = notre client,
  `iss` = Google, non expiré et `email_verified` vrai. Reconnaissance par `googleId`, puis
  rattachement par adresse la première fois.
  **Protection contre la pré-appropriation de compte** (propre à DatePlanner, faute de
  vérification d'adresse à l'inscription) : rattacher une identité Google à un compte local
  dont l'adresse n'a jamais été prouvée **efface son mot de passe et ferme toutes ses
  sessions**. Sans cela, un tiers qui aurait inscrit l'adresse d'autrui garderait l'accès au
  compte après que le vrai titulaire s'y est connecté par Google.
  Client OAuth distinct de celui de laserit.fr, URI de retour
  `https://dateplanner.laserit.fr/api/connexion/google/retour` (et `http://localhost:3000/…`
  en développement).
- **Rationale** : constitution I (rattachement sur adresse vérifiée, reconnaissance par
  identifiant). Le jeton arrive par un appel TLS direct authentifié par le secret client : la
  vérification de signature n'est pas requise (OIDC § 3.1.3.7), comme sur laserit.fr.
- **Alternatives considered** : bibliothèque d'authentification (Auth.js…) — dépendance
  lourde pour deux méthodes de connexion déjà écrites et testées, rejeté (principe VI).

## R6 — Reconnaître un répondant sans compte

- **Decision** : un cookie d'appareil `dp_appareil` (`HttpOnly`, `Secure`, `SameSite=Lax`,
  13 mois), jeton aléatoire de 256 bits posé à la première réponse sans compte. La réponse
  stocke l'**empreinte SHA-256** du jeton (`deviceTokenHash`), unique par sondage. Retrouver,
  modifier ou retirer une réponse sans compte exige un cookie dont l'empreinte correspond.
- **Rationale** : FR-018/FR-019 (une réponse par appareil et navigateur, modifiable depuis
  lui seul). L'empreinte seule en base : une fuite de la base ne permet pas de se faire passer
  pour un répondant. Cookie strictement nécessaire à un service demandé par l'utilisateur :
  pas de consentement requis.
- **Alternatives considered** : `localStorage` — lisible par tout script de la page et absent
  des requêtes serveur, rejeté ; empreinte du navigateur (fingerprinting) — traceur, contraire
  au principe IV, rejeté ; lien personnel de modification — option C écartée à la
  clarification.

## R7 — Lien de partage

- **Decision** : identifiant public aléatoire de 128 bits encodé en base64url (22 caractères),
  distinct de l'identifiant interne ; URL `https://dateplanner.laserit.fr/s/<identifiant>`.
  Toute valeur mal formée ou inconnue répond « sondage introuvable » (404).
- **Rationale** : FR-012 (impossible à deviner) ; 128 bits rendent l'énumération hors de
  portée, même sans limitation de débit.
- **Alternatives considered** : identifiant court lisible — devinable, rejeté ; identifiant
  interne dans l'URL — expose la clé primaire, rejeté.

## R8 — Mise à jour en direct

- **Decision** : **Server-Sent Events** sur `GET /api/s/<identifiant>/flux`, alimentés par
  `LISTEN/NOTIFY` de PostgreSQL (reprise de `server/events/bus.ts`). Un événement ne porte que
  `{ kind, at }` : « ce sondage a changé ». La page se relit par un rendu serveur ordinaire
  (`router.refresh()`), avec ses contrôles d'accès ; à la reconnexion, elle se relit aussi, ce
  qui rattrape ce qui a été manqué. Le flux est public (la page l'est pour qui a le lien), filtré
  par sondage avant l'envoi, avec battement toutes les 25 s, durée de vie de 55 min, et au plus
  **6 flux simultanés par adresse**.
- **Rationale** : FR-023, SC-003 (< 5 s) ; constitution II (le flux ne transporte rien qu'un
  visiteur du lien ne puisse déjà lire). Le proxy transmet le SSE sans tampon (réglage déjà en
  place). Un seul processus Node : pas besoin d'intermédiaire de messages.
- **Alternatives considered** : WebSocket — bidirectionnel inutile, reconnexion à écrire ;
  interrogation périodique — charge et latence, rejeté ; transporter les votes dans
  l'événement — deux chemins de lecture à sécuriser, rejeté.

## R9 — Calendrier

- **Decision** : porter `lib/date-picker.ts` (module pur : grille de six semaines, lundi en
  premier, numéros ISO, plages par glissé, colonnes et semaines, clavier, vues mois et année)
  et `components/date-picker.tsx` de laserit.fr, puis les **étendre** sans changer leur
  comportement :
  - création : mode `multiple`, `min` = aujourd'hui (Paris), plafond de 366 jours ;
  - réponse : mode `multiple`, jours non proposés ou passés passés en `disabled` ;
  - synthèse : **pastille** de nombre de votes par jour, **infobulle** des votants au survol
    et au focus clavier, et sous le calendrier une **liste « Qui est disponible ? »** triée par
    nombre de votes puis par jour (décision 031), toujours visible : c'est elle qui sert l'écran tactile (le toucher d'un jour reste
    réservé à la sélection) et les lecteurs d'écran ;
  - les mois qui contiennent des jours proposés sont signalés dans la navigation.
  « Aujourd'hui » est calculé à l'heure de Paris côté serveur et transmis à la page.
- **Rationale** : spec (FR-009, FR-015, FR-021, cas limites sur plusieurs mois) et SC-008 :
  une liste visible est trouvable sans aide sur téléphone, un appui long ne l'est pas.
- **Alternatives considered** : bibliothèque de calendrier — ne reproduit pas le comportement
  demandé, rejeté ; appui long pour les votants — geste non découvrable, rejeté.

## R10 — Emails et notifications

- **Decision** :
  - **file d'envoi en base** (`EmailOutbox`, reprise de laserit.fr) : un email n'est jamais
    envoyé dans une transaction métier ; il est mis en file, expédié après validation, retenté
    jusqu'à 5 fois par la maintenance (FR-043) ;
  - **transport** repris de `server/notifications/transport.ts` de laserit.fr, trois pilotes :
    `console` (développement et test), `gmail` (production : `smtp.gmail.com:465`, mot de
    passe d'application du compte `notificationslaserit@gmail.com`, déjà utilisé par
    laserit.fr), `smtp` générique ; expéditeur
    `DatePlanner <notificationslaserit@gmail.com>` ;
  - **résumé au créateur** (FR-041) : à chaque nouvelle réponse, si aucun résumé n'attend déjà
    pour ce sondage, un résumé est programmé à `max(maintenant + 15 min, dernier envoi + 30 min)`
    — les 15 minutes regroupent les réponses d'une même vague (5 réponses en 10 minutes ⇒ un
    seul email).
    Son contenu est **calculé à l'envoi** à partir de la base (réponses créées depuis le
    curseur du dernier résumé, encore présentes) : une réponse retirée entre-temps n'y figure
    pas ; un résumé devenu vide n'est pas envoyé. Règle de calcul dans un module pur ;
  - **annonce de la date retenue** (FR-042) : à la désignation ou au changement, un email par
    répondant connecté, dédoublonné ;
  - **désactivation en un clic** : chaque résumé porte un lien signé (HMAC-SHA-256 avec
    `APP_SECRET`, identifiant du sondage) vers une page de confirmation, et l'en-tête
    `List-Unsubscribe` ;
  - toute valeur saisie est échappée dans la branche HTML des emails.
- **Rationale** : constitution (« Emails ») et spec. Calculer à l'envoi plutôt qu'à la mise en
  file évite d'annoncer une réponse disparue.
- **Alternatives considered** : un email par réponse — inondation, contraire à FR-041 ;
  service d'envoi tiers (API) — nouvelle dépendance et sous-traitant de données, rejeté.

## R11 — Limitation de débit et abus

- **Decision** : fenêtres glissantes stockées en base (reprise de `server/ratelimit`),
  adresse lue dans `X-Real-IP` posé par Traefik, `RATE_LIMIT_ALLOWLIST` exacte pour
  l'exploitant. Seaux initiaux : connexion 10/15 min par adresse ; inscription 5/h par
  adresse ; mot de passe oublié 3/h par adresse et 3/h par compte ; création de sondage 20/h
  par compte ; réponse 30/h par adresse et 10/h par sondage et par adresse ; flux SSE 6
  simultanés par adresse. Champ leurre sur les formulaires publics. Refus avec un message
  indiquant le délai d'attente.
- **Rationale** : FR-005, FR-038, cas limite « envoi massif ». Pas de Redis : volume faible.
- **Alternatives considered** : captcha (Turnstile) — service tiers et traitement de données
  supplémentaire pour un risque que les seaux couvrent, rejeté en v1 (principes IV et VI) ;
  réévaluer si le bourrage se produit.

## R12 — Thème et identité visuelle

- **Decision** : reprendre les jetons de `globals.css` de laserit.fr (`light-dark()` sur
  `color-scheme`, encre de bois brûlé et papier crème, accent « braise », jade pour les
  états), les polices Space Grotesk et JetBrains Mono auto-hébergées par `next/font`, le
  script de thème avant la première peinture (porteur du nonce), `ThemeToggle` à deux
  positions et `localStorage` pour le choix explicite. Pastille de vote : aplat braise avec
  `--color-on-ember`, contraste vérifié dans les deux thèmes ; date retenue : aplat jade.
- **Rationale** : FR-029 à FR-031, décision 087 de laserit.fr, SC-007 (pas de flash).
- **Alternatives considered** : troisième position « système » — refusée par la décision 087.

## R13 — Page d'accueil

- **Decision** : page rendue au serveur, sans bibliothèque : une **démonstration en SVG et
  CSS** — la grille d'un mois se trace comme un trait de découpe laser (clin d'œil à l'animation
  d'accueil de laserit.fr), des jours s'allument, des pastilles de votes apparaissent et
  montent, la date retenue s'illumine en jade — puis les trois étapes, un aperçu du partage et
  l'appel « Créer un sondage » visible sans défiler. `prefers-reduced-motion` : état final
  affiché d'emblée. Budget : aucun script tiers, contenu principal en moins de 2,5 s en 4G
  (SC-006), animation par transformations et opacité seulement.
- **Rationale** : FR-032, FR-033 ; « impressionnante » tenue par le mouvement et la matière,
  pas par le poids de la page.
- **Alternatives considered** : vidéo ou GIF — lourd, flou, sans thème sombre ; bibliothèque
  d'animation — dépendance pour quelques transitions, rejeté.

## R14 — En-têtes de sécurité, indexation

- **Decision** : `proxy.ts` tire un nonce par requête et pose la CSP (`script-src 'self'
  'nonce-…'`, sans `'unsafe-inline'`), comme laserit.fr ; redirection 308 vers
  `https://dateplanner.laserit.fr` de toute requête reçue en clair, hors hôte local ;
  `noindex` sur les pages de sondage, de compte et de connexion ; `robots.txt` interdisant
  `/s/` ; accueil et pages légales indexables. Destination de retour après connexion analysée
  par `safeInternalPath`.
- **Rationale** : constitution I et « Adresse », FR-035, FR-037.

## R15 — Conservation et maintenance

- **Decision** : unité systemd `dateplanner-maintenance.timer` toutes les 10 minutes, appel
  local authentifié (`Authorization: Bearer CRON_SECRET`) de `POST /api/maintenance` :
  expédition de la file d'emails ; purge des sessions et jetons expirés, des traces de
  limitation de débit ; suppression des sondages 12 mois après leur dernier jour proposé ;
  avertissement par email puis suppression, 30 jours plus tard, des comptes sans activité depuis
  3 ans. Chaque passage est horodaté. Durées déclarées dans un module de configuration unique,
  reprises par la politique de confidentialité (un test les confronte).
- **Rationale** : constitution IV (durées appliquées automatiquement et annoncées), hypothèse
  « Conservation » de la spec.

## R16 — Stratégie de test

- **Decision** : Vitest pour les modules purs (calendrier, états du sondage, règles de
  réponse, calcul du résumé, conservation, validation) et pour l'intégration contre un **vrai
  PostgreSQL 17** (actions serveur, contrôles d'accès, concurrence, flux) ; Playwright
  (Chromium) pour les parcours : créer, répondre sans compte, voir la mise à jour dans un
  second contexte, clore avec date retenue, thème sans flash, accessibilité clavier et
  contraste (axe). Intégration continue GitHub Actions calquée sur laserit.fr : audit, types,
  lint, tests, build, bout en bout. Chaque FR porte au moins un test (principe III).
- **Rationale** : constitution III et « Flux de travail ».
- **Dépendance ajoutée** : `@axe-core/playwright`, en développement seulement (jamais servie
  aux visiteurs), seule dépendance absente de laserit.fr. Elle rend vérifiables à chaque
  poussée le contraste des deux thèmes, les rôles et les noms accessibles (FR-034, SC-009),
  qu'un contrôle manuel ne rejouerait pas à chaque version. Version exacte relevée par
  `npm view @axe-core/playwright version` à l'installation (T001) et reportée dans plan.md.
  Écartées : audit manuel seul (non rejoué), Lighthouse en CI (plus lourd, recoupe axe).
  `@types/nodemailer` n'est pas ajouté : Nodemailer 10 fournit ses propres déclarations.
- **Contrôles propres à la constitution** : un test compare les jetons visuels de
  `globals.css` à ceux de laserit.fr (FR-031) ; un test d'hygiène du dépôt vérifie qu'aucun
  fichier `.env*` hors `.env.example` n'est suivi par git et qu'aucun motif de secret (clé
  privée, `*_SECRET=`, `*_PASSWORD=` avec valeur) n'apparaît dans les fichiers suivis
  (constitution I, « aucun secret versionné »).

## R17 — Jours et fuseau

- **Decision** : un jour est une chaîne `AAAA-MM-JJ` côté code et une colonne `DATE` en base ;
  « aujourd'hui » = date courante à `Europe/Paris`, calculée par le serveur ; un jour est
  « passé » s'il est strictement antérieur à aujourd'hui (Paris).
- **Rationale** : hypothèse « Jours entiers » de la spec ; arithmétique du module calendrier
  déjà sans fuseau.

## R18 — Pages légales

- **Decision** : mentions légales et politique de confidentialité en pages statiques. Éditeur
  et hébergeur : l'exploitant (auto-hébergement, LCEN art. 6-III), identité lue dans une
  configuration unique. Politique : données (email, nom, mot de passe haché, identité Google,
  pseudo, votes, adresse IP dans les journaux et les seaux), finalités, durées (R15), cookies
  strictement nécessaires (`session`, `dp_appareil`, choix du thème en stockage local),
  droits et contact.
- **Rationale** : FR-036, constitution IV.

## R19 — Déploiement

- **Decision** : procédure calquée sur `deploy.md` de laserit.fr : la production sert un
  **tag** ; snapshot de la VM avant chaque déploiement ; `npm ci`, `prisma migrate deploy`,
  `npm run build`, redémarrage de `dateplanner.service` (compte système `dateplanner`, code
  dans `/opt/dateplanner`, secrets dans `/opt/dateplanner/.env` lus par `EnvironmentFile`).
  Sauvegarde `pg_dump` chaque nuit par `dateplanner-backup.timer`, copiée hors machine ;
  journal borné (500 Mo, 1 mois) ; surveillance extérieure de `GET /api/sante`.
- **Rationale** : constitution « Contraintes d'exploitation ».

---

## Paramètres d'exploitation à confirmer

Aucun ne bloque la conception ; chacun a une valeur par défaut retenue ci-dessus.

| Paramètre | Valeur retenue | À confirmer par |
|---|---|---|
| Identifiant et adresse de la VM | VM 102, `192.168.1.53` | l'exploitant (Proxmox, bail DHCP) |
| Adresse d'expédition des emails | `notificationslaserit@gmail.com` (boîte gmail) | l'exploitant |
| Identité légale (éditeur, hébergeur) | celle de laserit.fr | l'exploitant |
| Client OAuth Google | nouveau client, même projet Google Cloud | l'exploitant (console Google) |
