# Contrat — emails

Expéditeur : `DatePlanner <notificationslaserit@gmail.com>` (pilote `gmail`, voir R10). Chaque email
a une branche texte et une branche HTML ; dans la branche HTML, toute valeur saisie (titre,
nom, pseudo) est échappée. Contenu rendu **au moment de l'envoi** à partir de la base.

| Modèle | Déclencheur | Destinataire | Objet | Contenu | FR |
|---|---|---|---|---|---|
| `PASSWORD_RESET` | `requestPasswordReset` sur un compte existant | titulaire | « Réinitialiser votre mot de passe DatePlanner » | lien `/reinitialisation?jeton=…` valable 1 h ; « si vous n'êtes pas à l'origine… » | FR-004 |
| `OWNER_DIGEST` | nouvelle réponse d'un autre que le créateur sur un sondage à `notifyOwner` ; premier envoi 15 min après la première nouvelle réponse, puis au plus un par sondage toutes les 30 min | créateur | « {n} nouvelle(s) réponse(s) à « {titre} » » | noms des répondants arrivés depuis le résumé précédent et encore présents (créateur exclu), total des répondants, lien du sondage, lien de désactivation | FR-041 |
| `RETAINED_DAY` | date retenue désignée ou changée | chaque répondant connecté (dédoublonné, créateur exclu) | « Date retenue pour « {titre} » : {jour en toutes lettres} » | date, lien du sondage | FR-042 |
| `INACTIVITY_WARNING` | compte sans activité depuis 3 ans | titulaire | « Votre compte DatePlanner sera supprimé le {date} » | se connecter avant cette date pour le conserver | Assumptions (conservation) |

## Règles

- **Résumé vide** : si toutes les réponses annoncées ont été retirées avant l'envoi, l'email
  est annulé, le curseur avance quand même.
- **Désactivation** : lien signé HMAC-SHA-256 (`APP_SECRET`, identifiant du sondage, objet
  `owner-digest`) vers `/notifications/resume/desactiver?t=…` ; en-têtes `List-Unsubscribe`
  (URL HTTPS) et `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- **Échec d'envoi** : l'action d'origine a déjà réussi ; l'entrée reste `PENDING`, retentée
  par la maintenance, `FAILED` après 5 essais (FR-043).
- **Sondage supprimé** : tout email en attente qui le concerne est annulé.
