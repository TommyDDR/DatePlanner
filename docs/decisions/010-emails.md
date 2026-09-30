# Emails et notifications

_Source : research.md, R10._

## Décision

File d'envoi en base : un email est mis en file dans la transaction de l'action, expédié après validation, retenté jusqu'à 5 fois. Pilotes `console`, `gmail` (production, `notificationslaserit@gmail.com`) et `smtp`. Résumé au créateur programmé à `max(maintenant + 15 min, dernier envoi + 30 min)`, contenu calculé à l'envoi. Annonce de la date retenue à chaque répondant connecté. Désactivation du résumé par lien signé HMAC et `List-Unsubscribe`. Toute valeur saisie échappée dans la branche HTML.

## Pourquoi

Une panne de messagerie ne fait échouer aucune action. Calculer le contenu à l'envoi évite d'annoncer une réponse retirée entre-temps ; les 15 minutes regroupent une vague de réponses en un seul email (FR-041). Écartés : un email par réponse (inondation), un service d'envoi tiers (dépendance et sous-traitant de plus).
