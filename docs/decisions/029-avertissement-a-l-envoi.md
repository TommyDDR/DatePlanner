# Le délai avant suppression court à l'envoi de l'avertissement

_Source : implémentation._

## Décision

`inactivityWarnedAt` n'est posé qu'une fois l'email d'avertissement PARTI, et les 30 jours courent de là. Tant qu'un avertissement attend son départ, aucun autre n'est mis en file ; un envoi en échec est retenté chaque jour. Les emails partis, annulés ou en échec sont purgés à 30 jours.

## Pourquoi

Poser la date à la mise en file ferait supprimer, un mois plus tard, un compte dont l'avertissement a été bloqué par une panne de messagerie. La purge des échecs évite de garder indéfiniment l'adresse d'un destinataire.
