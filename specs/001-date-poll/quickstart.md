# Quickstart — valider DatePlanner de bout en bout

Guide de vérification : installer, lancer, puis dérouler les scénarios qui prouvent que la
fonctionnalité marche. Détails des interfaces : [contracts/](contracts/) ; données :
[data-model.md](data-model.md).

## 1. Prérequis

- Node.js 22 LTS, npm.
- PostgreSQL 17 local, avec deux bases : `dateplanner` (développement) et `dateplanner_test`.
- Pour la connexion Google en local : un client OAuth dont l'URI de retour autorisée est
  `http://localhost:3000/api/connexion/google/retour`.

## 2. Installation

```bash
npm ci
cp .env.example .env         # puis renseigner les valeurs ci-dessous
npx prisma migrate deploy
npm run dev                  # http://localhost:3000
```

Variables attendues (`.env.example` les documente) :

| Variable | Rôle | Développement |
|---|---|---|
| `DATABASE_URL` | base PostgreSQL | `postgresql://…/dateplanner` |
| `NEXT_PUBLIC_SITE_URL` | adresse publique | `http://localhost:3000` |
| `APP_SECRET` | signatures (cookie Google, liens de désactivation) | 32 octets aléatoires |
| `CRON_SECRET` | appel de la maintenance | valeur aléatoire |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | connexion Google | client de développement |
| `EMAIL_DRIVER` | `console`, `gmail` ou `smtp` | `console` (emails écrits dans le terminal) |
| `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | envoi réel (`gmail` : adresse et mot de passe d'application) | vides |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | pilote `smtp` seulement | vides |
| `RATE_LIMIT_DISABLED` | neutralise les seaux, jamais en production | `1` si besoin |

## 3. Contrôles automatiques

```bash
npm audit --omit=dev   # 0 faille
npm run typecheck      # 0 erreur
npm run lint           # 0 erreur, 0 avertissement
npm test               # modules purs + intégration contre dateplanner_test
npm run build          # 0 avertissement
npm run e2e            # parcours Playwright (Chromium)
```

Tous doivent être verts avant toute fusion (constitution, « Flux de travail »).

## 4. Scénarios de validation manuelle

Deux navigateurs sont utiles : A (créateur) et B (fenêtre privée, répondant).

| # | Étapes | Résultat attendu | Spec |
|---|---|---|---|
| 1 | Ouvrir `/` sur ordinateur puis sur téléphone | démonstration animée, trois étapes, bouton « Créer un sondage » visible sans défiler ; aucun défilement horizontal | US6, SC-006 |
| 2 | Activer « réduire les animations » dans le système, recharger `/` | démonstration immobile, compréhensible | FR-033 |
| 3 | Système en sombre, première visite | page sombre dès le premier affichage ; basculer en clair, recharger : reste clair | US7, SC-007 |
| 4 | A : « Créer un sondage » sans compte | redirection vers la connexion, puis retour sur `/nouveau` après inscription | US1-1 |
| 5 | A : titre vide ou aucun jour, valider | refus, champ signalé, saisie conservée | US1-3 |
| 6 | A : glisser sur une semaine, cliquer une initiale de colonne, un numéro de semaine, tenter un jour passé | plage, colonne et semaine basculent ; jour passé inerte | US1-4/5/6, FR-009 |
| 7 | A : créer avec 3 jours, copier le lien | lien `/s/…` de 22 caractères copié | US1-2, FR-012 |
| 8 | B : ouvrir le lien, pseudo « Léa », cocher 2 jours, valider | pastilles « 1 » sur les 2 jours, infobulle « Léa », liste « Qui est disponible ? » à jour | US2-1, US3 |
| 9 | A (page du sondage ouverte pendant l'étape 8) | pastilles mises à jour en moins de 5 s sans recharger | US3-5, SC-003 |
| 10 | B : recharger le lien | jours pré-cochés ; modifier, puis Retirer | US2-7, FR-019 |
| 11 | B : tenter un jour non proposé | jour inactif ; la même requête forgée (voir tests d'intégration) est refusée en entier | US2-3/4, SC-004 |
| 12 | A : retirer un jour voté ; retirer un jour sans vote ; ajouter un jour | refus, succès, succès ; B voit les changements en direct | US5-6/7 |
| 13 | A : supprimer la réponse de B | disparaît pour tous | US5-8, FR-039 |
| 14 | A : activer « répondants connectés uniquement » ; B sans session recharge | plus de champ pseudo, invitation à se connecter | US2-8, FR-040 |
| 15 | A : clore en désignant un jour ; B connecté avait répondu | bandeau « clos », date en jade, plus de formulaire ; email `RETAINED_DAY` à B (terminal en `console`) | US5-4, FR-042 |
| 16 | A : rouvrir | formulaire de retour, date retenue effacée | US5-5 |
| 17 | 5 réponses en moins de 10 min | un seul email `OWNER_DIGEST` listant les 5, parti 15 min après la première | US5-11, FR-041 |
| 18 | Lien de désactivation du résumé | confirmation ; plus de résumé pour ce sondage | FR-041 |
| 19 | Connexion Google (compte neuf, puis compte local de même adresse) | compte créé, puis rattaché sans doublon | US4 |
| 20 | `/s/inconnu`, sondage supprimé, action d'un non-créateur | « introuvable », jamais « interdit » | FR-028 |
| 21 | Navigation au clavier seul sur `/nouveau` et `/s/…` | tout faisable, focus visible, votants annoncés au focus | SC-009 |
| 22 | B : répondre sans compte, puis se connecter sur le même navigateur et rouvrir le lien ; se déconnecter et rouvrir | connecté : formulaire vierge sous le compte ; déconnecté : la réponse anonyme pré-remplie | cas limite « se connecte ensuite » |
| 23 | Compte local jamais prouvé, puis connexion Google de la même adresse | compte rattaché, mot de passe effacé, autres sessions fermées | US4-3 |

Maintenance en local :

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/maintenance
curl http://localhost:3000/api/sante   # {"status":"ok"}
```

## 5. Vérifications après mise en production

À dérouler après le premier déploiement sur `dateplanner.laserit.fr` (procédure :
`deploy.md`, créé avec le code).

| Vérification | Commande ou geste | Attendu |
|---|---|---|
| DNS | `Resolve-DnsName dateplanner.laserit.fr` | `<IP publique>` (par le CNAME vers `laserit.fr`) |
| HTTPS et certificat | ouvrir `https://dateplanner.laserit.fr` | certificat Let's Encrypt valide ; `http://` redirigé |
| Santé | `curl -s -o /dev/null -w "%{http_code}" https://dateplanner.laserit.fr/api/sante` | `200` |
| Direct à travers le proxy | scénario 9 sur la production | mise à jour en moins de 5 s |
| Isolement de la VM | depuis une autre machine du réseau que le proxy : `curl http://192.168.1.53:3000` | refusé par le pare-feu |
| Emails | scénario 17 avec `EMAIL_DRIVER=gmail` | email reçu, lien de désactivation fonctionnel |
| Google | scénario 19 | retour sur `https://dateplanner.laserit.fr/api/connexion/google/retour` accepté |
| Maintenance | `systemctl list-timers dateplanner-maintenance.timer` | passage toutes les 10 min ; `/api/sante` sans `"maintenance":"late"` |
| Sauvegarde | lancer `dateplanner-backup.service`, puis restaurer sur une base vierge | archive créée, restauration complète |
