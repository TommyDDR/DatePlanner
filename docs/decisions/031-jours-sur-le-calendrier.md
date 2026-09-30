# Jours proposés modifiés sur le calendrier, synthèse triée

_Source : évolution après la version 0.1.0._

## Décision

Dans le panneau du créateur, « Jours proposés » n'est plus une liste : c'est le calendrier seul, sur deux mois. Un jour du sondage sans vote est orangé, et un clic le retire ; un jour déjà voté est gris et ne bouge pas, pas plus que la date retenue ; un jour libre s'ajoute d'un clic. Un jour retiré garde un contour pointillé jusqu'à l'envoi, et un clic le rétablit. Rien ne part avant « Enregistrer les jours », qui envoie ajouts et retraits ensemble (`changePollDays`), tout ou rien. Les jours passés ne se modifient plus.

Un vote peut arriver pendant que le créateur prépare ses changements. La mise à jour en direct relit alors le panneau : le jour passe au gris, son retrait tombe, et un avertissement le nomme. Si le vote arrive entre l'envoi et l'écriture, le serveur refuse tout (`DAY_HAS_VOTES`) et relit la page, qui avertit de même.

« Qui est disponible ? » range les jours du plus voté au moins voté, le plus proche d'abord à égalité. Dans le calendrier, les jours qui réunissent le plus de votants, tous en cas d'égalité, sont cernés d'or (`--color-leading`, l'ambre de laserit.fr).

## Pourquoi

Une liste de jours à côté d'un calendrier d'ajout disait deux fois la même chose, sans montrer où tombent les jours. Un seul envoi évite qu'un retrait passe et qu'un ajout échoue, ou l'inverse. Un retrait devancé par un vote ne se fait pas en silence : le créateur doit savoir pourquoi le jour reste (décision 022).

La liste triée répond d'abord à « quel jour ? » ; le contour doré le fait voir sur le calendrier sans lire les pastilles. L'ambre passe 3:1 sur la matière dans les deux modes, un jaune plus vif non.
