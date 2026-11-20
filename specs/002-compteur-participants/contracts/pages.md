# Contrat d'affichage : compteur de participants

Complète [pages.md de la fonctionnalité 001](../../001-date-poll/contracts/pages.md)
pour la page `/s/[publicId]`. Aucune route, action serveur ni API HTTP nouvelle ;
le flux `/api/s/[publicId]/flux` est inchangé.

## Page `/s/[publicId]`

| Élément | Contrat |
|---------|---------|
| Présence | Toujours rendu, pour tout visiteur, sondage ouvert ou clos, avec ou sans « répondants connectés uniquement ». |
| Position | Dans l'en-tête du sondage, après le titre (et la description si présente), avant la section de réponse. |
| Sélecteur de test | `data-testid="compteur-participants"` |
| Rôle | `role="status"` (région polie) ; le nœud persiste entre deux relectures en direct. |
| Texte | `participantCountLabel(respondents)` : « Personne n'a encore répondu », « 1 participant », « N participants ». |
| Données | Un entier. Aucun nom, aucun identifiant. |
| Direct | Mis à jour par la relecture de page déclenchée par l'événement `responses`, sans rechargement. |
| Mise en page | Une ligne ; aucun débordement horizontal à 320 px ; jetons de couleur existants (deux thèmes). |
