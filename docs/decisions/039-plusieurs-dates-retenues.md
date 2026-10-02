# Plusieurs dates retenues

_Source : évolution après la version 0.4.1._

## Décision

Une option du sondage, « Plusieurs dates retenues », désactivée par défaut, se choisit à la création et se change dans les options du panneau du créateur. Activée, le calendrier de la clôture passe en choix multiple : le créateur retient autant de jours proposés qu'il veut, d'un clic par jour, et un raccourci des plus choisis ajoute ou rend son jour. Sans l'option, rien ne change : une seule date retenue au plus. Revenir à une seule date n'est permis qu'une fois les autres rendues.

Les dates retenues quittent la colonne `poll.retained_day_id` pour une table, `retained_day`. Chaque ligne tient à son jour par une clé composite différée - un jour retenu ne se retire pas -, et à l'état clos du sondage par une clé vers `poll(id, status)`, sa colonne `poll_status` valant toujours `CLOSED` : la base refuse un jour retenu sur un sondage ouvert, et la réouverture d'un sondage qui en garde. Une seule date sans l'option : le serveur le vérifie sous le verrou du sondage.

Partout où la date retenue se montrait, toutes s'affichent en jade : bandeau « Dates retenues » de la page, calendrier en consultation, « Qui est disponible ? », « Mes sondages » - trois dates nommées, puis leur nombre. L'annonce aux répondants connectés porte toutes les dates retenues ; elle part quand l'ensemble change et qu'il en reste, une date rendue comprise.

## Pourquoi

Un sondage de dates ne décide pas toujours d'un seul jour : un stage sur deux week-ends, des répétitions, un événement sur plusieurs soirs. L'option garde le cas courant tel qu'il était, un seul jour, et ne change les écrans que pour qui l'a demandée. Une date rendue s'annonce aussi : qui s'était organisé pour elle doit le savoir.
