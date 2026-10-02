# Éditeur non professionnel, identité hors du dépôt

_Source : évolution après la version 0.4.1._

## Décision

DatePlanner est édité à titre non professionnel, sans lien avec l'activité de laserit.fr, dont il n'emprunte que le sous-domaine. Les mentions légales le disent, et n'affichent plus ni SIRET, ni numéro RNE, ni la mention « EI », ni numéro de téléphone.

Le nom et l'adresse de l'éditeur restent affichés : le service est auto-hébergé, l'éditeur en est donc aussi l'hébergeur au sens de la LCEN. Ils sont lus dans `EDITOR_NAME` et `EDITOR_ADDRESS` (`readEditor`, `src/config/identity.ts`), jamais écrits dans le code. Hors production, une valeur absente s'affiche « non renseignée » ; en production, elle fait échouer le build.

## Pourquoi

Le dépôt est public : une donnée personnelle versionnée y est publiée, et le reste dans l'historique. Le téléphone n'est exigé que d'un éditeur professionnel, et le SIRET présentait le service comme une activité de l'entreprise individuelle, ce qu'il n'est pas. Échouer au build plutôt qu'au rendu garde l'ancienne version en ligne si le `.env` du serveur n'a pas été complété.
