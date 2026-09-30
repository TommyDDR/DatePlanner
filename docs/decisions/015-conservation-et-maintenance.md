# Conservation et maintenance

_Source : research.md, R15._

## Décision

`dateplanner-maintenance.timer` appelle toutes les 10 minutes, en boucle locale et avec `CRON_SECRET`, `POST /api/maintenance` : sondages supprimés 12 mois après leur dernier jour ; avertissement à 3 ans d'inactivité puis suppression 30 jours plus tard ; envoi de la file d'emails ; purge des sessions, jetons, traces anti-flood et emails de plus de 30 jours ; horodatage du passage. Durées déclarées une fois, dans `src/config/retention.ts`.

## Pourquoi

Constitution IV : des durées appliquées automatiquement ET annoncées. La politique de confidentialité les lit dans la même configuration, et un test confronte le texte rendu à ces valeurs.
