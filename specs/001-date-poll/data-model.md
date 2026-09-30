# Modèle de données : DatePlanner

**Spec** : [spec.md](spec.md) · **Recherche** : [research.md](research.md)

PostgreSQL 17, schéma géré par Prisma 7. Identifiants internes : UUID. Les noms de tables et
de colonnes sont en anglais ; le vocabulaire de la spec est rappelé entre parenthèses.

```text
User 1───* Poll 1───* PollDay 1───* Vote *───1 Response *───1 Poll
  │                     ▲                          │
  │                     └── retainedDay (0..1) ────┘ Poll
  └──* Response (réponses connectées)
User 1───* Session, 1───* PasswordResetToken
EmailOutbox, RateLimitHit, MaintenanceRun : tables techniques
```

---

## User (Utilisateur)

| Champ | Type | Règles |
|---|---|---|
| id | uuid | clé |
| email | text | unique, stocké en minuscules, sans espaces ; 3 à 254 caractères |
| displayName | text | 1 à 60 caractères après retrait des espaces ; affiché aux autres |
| passwordHash | text? | argon2id ; `null` pour un compte né de Google ou dont le mot de passe a été effacé au rattachement (R5) |
| googleId | text? | unique ; identifiant `sub` de Google |
| emailProvedAt | timestamp? | posé quand Google a vérifié l'adresse ou qu'un lien envoyé à l'adresse a été utilisé ; jamais réécrit une fois posé |
| failedLoginCount | int | 0 par défaut ; remis à 0 à la connexion réussie |
| lockedUntil | timestamp? | verrou progressif |
| lastActiveAt | timestamp | mis à jour au plus une fois par jour ; base de la conservation (3 ans) |
| inactivityWarnedAt | timestamp? | avertissement avant suppression ; remis à `null` à toute activité |
| createdAt | timestamp | |

- **Suppression** : physique. Emporte en cascade sessions, jetons, sondages créés (et leurs
  jours, réponses, votes) et réponses données sur les sondages d'autrui (FR-006).
- **Mot de passe** : règle de FR-002 appliquée au choix (inscription, réinitialisation,
  changement), pas à la connexion.

## Session

| Champ | Type | Règles |
|---|---|---|
| id | uuid | clé |
| userId | uuid | → User, suppression en cascade |
| tokenHash | text | unique ; SHA-256 du jeton du cookie |
| createdAt | timestamp | plafond absolu : +90 jours |
| expiresAt | timestamp | glissante : +30 jours depuis la dernière activité |
| lastSeenAt | timestamp | |

## PasswordResetToken

| Champ | Type | Règles |
|---|---|---|
| id | uuid | clé |
| userId | uuid | → User, cascade |
| tokenHash | text | unique ; SHA-256 |
| expiresAt | timestamp | +1 heure |
| usedAt | timestamp? | usage unique : consommé par une écriture conditionnelle `usedAt IS NULL` |

## Poll (Sondage)

| Champ | Type | Règles |
|---|---|---|
| id | uuid | clé interne, jamais exposée dans une URL |
| publicId | text | unique ; 22 caractères base64url, 128 bits aléatoires (R7) |
| ownerId | uuid | → User, cascade |
| title | text | obligatoire, 1 à 120 caractères après retrait des espaces |
| description | text? | 0 à 2 000 caractères ; vide enregistré comme `null` |
| status | enum `OPEN` \| `CLOSED` | `OPEN` à la création |
| retainedDayId | uuid? | → PollDay du même sondage ; non nul seulement si `status = CLOSED` |
| requireAccount | boolean | `false` par défaut (FR-040) |
| notifyOwner | boolean | `true` par défaut (FR-041) |
| ownerDigestSentAt | timestamp? | dernier résumé envoyé au créateur |
| ownerDigestCursor | timestamp | réponses créées après cet instant = nouvelles pour le prochain résumé ; initialisé à la création |
| closedAt | timestamp? | |
| createdAt, updatedAt | timestamp | |

- **Contraintes** : `CHECK (status = 'CLOSED' OR retained_day_id IS NULL)` ; la clé étrangère
  `retainedDayId` porte aussi `pollId` (clé composite) pour interdire un jour d'un autre
  sondage.
- **Dernier jour proposé** : calculé (`max(PollDay.day)`), base de la purge à 12 mois.

### Transitions d'état

```text
            close(retainedDay?)                     setRetainedDay(day | null)
  OPEN ───────────────────────────▶ CLOSED ◀──────────────────────────────┐
   ▲                                  │  └────────────────────────────────┘
   └──────────── reopen() ────────────┘   (reopen efface retainedDayId)
```

| Action | Depuis | Vers | Garde (serveur) | Effets |
|---|---|---|---|---|
| close | OPEN | CLOSED | créateur | `closedAt` ; `retainedDayId` si fourni (jour du sondage) ; annonce FR-042 si date retenue |
| setRetainedDay | CLOSED | CLOSED | créateur ; jour du sondage | annonce FR-042 si la date change et n'est pas `null` |
| reopen | CLOSED | OPEN | créateur | `retainedDayId = null`, `closedAt = null` |

Toutes les transitions sont des écritures conditionnelles (`WHERE id = … AND status = …`) :
deux clics simultanés n'en appliquent qu'un.

## PollDay (Jour proposé)

| Champ | Type | Règles |
|---|---|---|
| id | uuid | clé |
| pollId | uuid | → Poll, cascade |
| day | date | unique avec `pollId` |

- **Création et ajout** (FR-010, FR-011, FR-027) : `day ≥ aujourd'hui (Paris)` ; au plus 366
  jours par sondage, vérifié dans la même transaction que l'insertion.
- **Retrait** (FR-027) : `DELETE … WHERE id = ? AND NOT EXISTS (vote sur ce jour)` et le sondage
  garde au moins un jour ; la clé étrangère `Vote → PollDay` et celle de `retainedDayId`
  sont en `NO ACTION DEFERRABLE INITIALLY DEFERRED` : même une course perdue ne peut pas
  effacer un vote ni la date retenue. Différées, et non simplement `NO ACTION` ou
  `RESTRICT` : PostgreSQL exécute chaque cascade comme une instruction à part et y vérifie
  une contrainte ordinaire avant que la cascade voisine (réponses, puis votes) ait eu lieu ;
  la suppression d'un sondage ou d'un compte échouerait. Vérifiées à la validation de la
  transaction, elles laissent passer la cascade et refusent toujours le retrait direct d'un
  jour voté (vérifié par `tests/integration/schema-constraints.test.ts`).

## Response (Réponse)

| Champ | Type | Règles |
|---|---|---|
| id | uuid | clé |
| pollId | uuid | → Poll, cascade |
| userId | uuid? | → User, cascade ; réponse connectée |
| pseudonym | text? | 1 à 50 caractères après retrait des espaces ; réponse sans compte |
| deviceTokenHash | text? | SHA-256 du cookie `dp_appareil` ; réponse sans compte |
| createdAt | timestamp | sert au curseur du résumé |
| updatedAt | timestamp | |

- **Exactement une identité** : `CHECK ((user_id IS NOT NULL AND pseudonym IS NULL AND
  device_token_hash IS NULL) OR (user_id IS NULL AND pseudonym IS NOT NULL AND
  device_token_hash IS NOT NULL))`.
- **Unicité** (FR-018) : `UNIQUE (poll_id, user_id)` et `UNIQUE (poll_id, device_token_hash)`
  (index partiels sur les valeurs non nulles). Une seconde soumission du même répondant met à
  jour sa réponse au lieu d'en créer une autre.
- **Nom affiché** : `User.displayName` (lu au rendu, donc à jour) pour une réponse connectée,
  sinon `pseudonym` ; une réponse connectée est marquée comme telle à l'affichage.
- **Au moins un vote** : garanti par l'action serveur, dans la transaction (FR-017) ; retirer sa
  réponse la supprime avec ses votes.

## Vote

| Champ | Type | Règles |
|---|---|---|
| responseId | uuid | → Response, cascade |
| pollDayId | uuid | → PollDay, **no action, différée** (voir PollDay) |

- Clé primaire `(responseId, pollDayId)`.
- **Validité** (FR-015, FR-016) : à l'enregistrement, chaque jour doit appartenir au sondage de
  la réponse et ne pas être passé ; le sondage doit être `OPEN` et, si `requireAccount`, la
  réponse doit être connectée. Vérifié par le serveur dans la transaction ; le moindre jour
  invalide refuse toute la réponse.
- **Comptage** : nombre de votes d'un jour = `COUNT(*)` des votes sur ce `PollDay`.

## EmailOutbox

| Champ | Type | Règles |
|---|---|---|
| id | uuid | clé |
| to | text | destinataire |
| template | enum | `PASSWORD_RESET`, `OWNER_DIGEST`, `RETAINED_DAY`, `INACTIVITY_WARNING` |
| payload | json | identifiants seulement (sondage, compte, jeton brut pour la réinitialisation) ; le contenu est rendu à l'envoi |
| pollId | uuid? | pour retrouver un résumé en attente d'un sondage |
| status | enum | `PENDING`, `SENT`, `CANCELLED`, `FAILED` |
| sendAfter | timestamp | |
| attempts | int | ≤ 5, puis `FAILED` |
| lastError | text? | |
| createdAt, sentAt | timestamp | |

- Un seul `OWNER_DIGEST` `PENDING` par sondage : index unique partiel
  `(poll_id) WHERE template = 'OWNER_DIGEST' AND status = 'PENDING'`.
- Lignes envoyées purgées après 30 jours ; le jeton de réinitialisation n'y survit pas au-delà
  de son échéance.

## RateLimitHit

| Champ | Type | Règles |
|---|---|---|
| id | bigint | clé |
| bucket | text | nom du seau (R11) |
| key | text | adresse ou identifiant de compte / sondage |
| weight | int | 1 par défaut |
| at | timestamp | fenêtre glissante ; index `(bucket, key, at)` ; purgé au-delà de la plus longue fenêtre |

## MaintenanceRun

| Champ | Type | Règles |
|---|---|---|
| id | int | ligne unique |
| lastRunAt | timestamp | passage de la maintenance, lu par `/api/sante` pour signaler un ordonnanceur arrêté |

---

## Règles transverses

| Règle | Où elle vit |
|---|---|
| Contrôle d'accès du créateur | clause `WHERE owner_id = :sessionUser` de chaque écriture sur un sondage ; zéro ligne touchée ⇒ « introuvable » |
| Contrôle d'accès du répondant | connecté : `WHERE user_id = :sessionUser` seulement (la réponse anonyme de l'appareil est ignorée) ; sans session : `WHERE device_token_hash = :hash(cookie)` |
| Jours valides | module pur (`lib/poll-rules`) + revérification transactionnelle |
| Conservation | module de configuration unique (`config/retention`) lu par la maintenance et la politique de confidentialité |
