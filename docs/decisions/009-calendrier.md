# Calendrier

_Source : research.md, R9._

## Décision

Le module pur `lib/date-picker.ts` et le composant de laserit.fr, portés puis étendus : création en mode multiple à partir d'aujourd'hui (Paris), plafond de 366 jours ; réponse limitée aux jours proposés à venir ; pastille du nombre de votes par jour, infobulle des votants au survol et au focus, et sous le calendrier une liste « Qui est disponible ? » toujours visible ; mois porteurs de jours proposés signalés dans la navigation.

## Pourquoi

La liste visible sert l'écran tactile - le toucher d'un jour reste réservé à la sélection - et les lecteurs d'écran : elle se trouve sans aide sur téléphone (SC-008), un appui long non. Écartée : une bibliothèque de calendrier, qui ne reproduit pas le comportement demandé.
