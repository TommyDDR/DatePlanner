# Contrat — actions serveur

Toutes les mutations passent par des Server Actions. Chaque action : valide son entrée avec
un schéma Zod partagé avec le formulaire, vérifie le droit **dans la requête d'écriture**,
consomme ses seaux de limitation (R11), publie l'événement « sondage changé » **après** la
transaction, met les emails en file **dans** la transaction.

Une action qui change ce que voit un participant (réponse, titre, description, jours, état,
dates retenues ; pas les options) fait aussi avancer, **après** la transaction, la version du
sondage (`activityAt`), et note que son auteur connecté l'a vue : « Du nouveau » pour les
autres, pas pour lui (FR-044, décision 034).

## Forme des résultats

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

type ActionError =
  | { code: 'VALIDATION'; fields: Record<string, string> } // message par champ, en français
  | { code: 'NOT_FOUND' }                                  // absent OU refusé : indiscernable
  | { code: 'RATE_LIMITED'; retryAfterSeconds: number }
  | { code: 'POLL_CLOSED' }
  | { code: 'ACCOUNT_REQUIRED' }
  | { code: 'DAY_HAS_VOTES'; day: string }
  | { code: 'LAST_DAY' }
  | { code: 'AUTH_FAILED' }                                // message de connexion unique
  | { code: 'REAUTH_REQUIRED' };
```

Types communs : `Day` = `AAAA-MM-JJ` ; `PublicId` = 22 caractères `[A-Za-z0-9_-]`.

## Comptes

| Action | Entrée | Succès | Erreurs | FR |
|---|---|---|---|---|
| `register` | `email`, `displayName` (1–60), `password` (règle FR-002), `next?` | session ouverte, redirection vers `next` sûr ou `/mes-sondages` | `VALIDATION`, `RATE_LIMITED`, `AUTH_FAILED` (adresse déjà inscrite et mot de passe faux) | FR-001, FR-002, FR-005 |
| `login` | `email`, `password`, `next?` | session ouverte, redirection | `AUTH_FAILED`, `RATE_LIMITED` | FR-005 |
| `logout` | — | session fermée, redirection `/` | — | |
| `requestPasswordReset` | `email` | toujours `ok` ; email mis en file si le compte existe | `RATE_LIMITED` | FR-004 |
| `resetPassword` | `token`, `password` | mot de passe changé, `emailProvedAt` posé, toutes les sessions fermées puis une nouvelle ouverte | `VALIDATION`, `NOT_FOUND` (jeton invalide, expiré ou consommé) | FR-004 |
| `updateDisplayName` | `displayName` | nom mis à jour | `VALIDATION` | |
| `deleteAccount` | `password?` | compte et données supprimés, session fermée | `AUTH_FAILED` (mot de passe faux), `REAUTH_REQUIRED` (compte sans mot de passe et connexion de plus de 10 min) | FR-006 |

## Sondages (créateur)

Toutes exigent une session ; toute écriture porte `WHERE owner_id = :session` et répond
`NOT_FOUND` si aucune ligne n'est touchée (FR-028).

| Action | Entrée | Succès | Erreurs | FR |
|---|---|---|---|---|
| `createPoll` | `title` (1–120), `description?` (≤ 2000), `days: Day[]` (1–366, uniques, ≥ aujourd'hui Paris), `requireAccount`, `notifyOwner`, `multipleRetainedDays` | `{ publicId }` | `VALIDATION`, `RATE_LIMITED` | FR-007–012, FR-040, FR-041, FR-045 |
| `updatePollDetails` | `publicId`, `title`, `description?` | publié aux abonnés | `VALIDATION`, `NOT_FOUND` | FR-025 |
| `changePollDays` | `publicId`, `add: Day[]` (≥ aujourd'hui, total ≤ 366), `remove: Day[]` (jours du sondage sans vote, hors dates retenues) | jours ajoutés (doublons ignorés) et retirés, tout ou rien ; refusé pour `DAY_HAS_VOTES`, la page est relue | `VALIDATION`, `DAY_HAS_VOTES`, `LAST_DAY`, `NOT_FOUND` | FR-027 |
| `setPollOptions` | `publicId`, `requireAccount?`, `notifyOwner?`, `multipleRetainedDays?` | options enregistrées | `VALIDATION` (`multipleRetainedDays` retirée alors que plusieurs dates sont retenues), `NOT_FOUND` | FR-040, FR-041, FR-045 |
| `closePoll` | `publicId`, `retainedDays: Day[]` (jours du sondage ; un au plus sans `multipleRetainedDays` ; aucun : clos sans date) | `CLOSED` ; annonce FR-042 mise en file s'il y a des dates | `VALIDATION`, `NOT_FOUND` (dont déjà clos) | FR-026, FR-042, FR-045 |
| `setRetainedDays` | `publicId`, `retainedDays: Day[]` (mêmes règles) | dates changées ; annonce si elles changent et qu'il en reste | `VALIDATION` (jour étranger au sondage, plusieurs dates sans l'option), `NOT_FOUND` (sondage absent ou encore ouvert) | FR-026, FR-042, FR-045 |
| `reopenPoll` | `publicId` | `OPEN`, dates retenues effacées | `NOT_FOUND` | FR-026 |
| `deleteResponse` | `publicId`, `responseId` | réponse et votes supprimés | `NOT_FOUND` | FR-039 |
| `deletePoll` | `publicId` | sondage supprimé, redirection `/mes-sondages` | `NOT_FOUND` | FR-025 |

## Réponses (répondant)

| Action | Entrée | Succès | Erreurs | FR |
|---|---|---|---|---|
| `submitResponse` | `publicId`, `days: Day[]` (≥ 1), `pseudonym?` (1–50, exigé sans session) | réponse créée ou mise à jour — connecté : réponse du compte seulement (la réponse anonyme de l'appareil est ignorée) ; sans session : réponse de l'appareil ; cookie `dp_appareil` posé s'il manquait (sans session) ; résumé du créateur programmé si création | `VALIDATION` (jour non proposé ou passé ⇒ refus total), `POLL_CLOSED`, `ACCOUNT_REQUIRED`, `RATE_LIMITED`, `NOT_FOUND` | FR-013–019, FR-040, FR-041 |
| `withdrawResponse` | `publicId` | connecté : réponse du compte supprimée ; sans session : réponse de l'appareil supprimée (y compris quand le compte est désormais exigé) | `POLL_CLOSED`, `NOT_FOUND` | FR-019 |
| `markPollSeen` | `publicId`, `version` (date ISO : la version que la page affiche) | appelée par la page d'un sondage à chaque version affichée ; pour le créateur ou un répondant connecté, version vue portée à `min(version, activityAt)`, jamais reculée ; « Mes sondages » relue si elle a avancé. Sans session ou pour un autre compte, rien n'est écrit | aucune (sans effet) | FR-044 |

Garanties : un pseudo n'est jamais accepté d'une session connectée (le nom vient du compte) ;
la revérification de chaque jour a lieu dans la transaction qui écrit les votes (FR-016) ;
deux soumissions simultanées du même répondant n'en créent qu'une (contrainte d'unicité, puis
mise à jour).

## Notifications

| Action | Entrée | Succès | Erreurs | FR |
|---|---|---|---|---|
| `disableOwnerDigest` | `token` (lien signé) | `notifyOwner = false` pour ce sondage ; résumé en attente annulé | `NOT_FOUND` (signature invalide ou sondage supprimé) | FR-041 |
