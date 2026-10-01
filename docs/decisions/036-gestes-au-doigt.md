# Gestes au doigt sur le calendrier

_Source : évolution après la version 0.4.0._

## Décision

Au doigt, la grille des jours laisse défiler la page : un geste qui bouge d'emblée (plus de 10 px avant 350 ms) est un défilement, et ne choisit rien. Le glissé qui marque une plage attend un appui long : tenu 350 ms sur un jour, le doigt prend la main - un anneau le signale, le téléphone vibre quand il le peut -, la page cesse de défiler, et le glissé part du jour tenu.

Relâché sur place, l'appui long sur un jour voté ouvre la bulle de ses votants sans le faire basculer ; elle tient jusqu'au toucher suivant. En consultation, où rien ne se choisit, le doigt tenu promène la bulle d'un jour voté à l'autre. Sur un jour sans votes, l'appui long relâché sur place reste une tape lente : le jour bascule.

Une tape reste une tape, et la souris glisse toujours sans attendre. Le focus n'ouvre plus la bulle qu'au clavier (`:focus-visible`).

## Pourquoi

La grille refusait tout défilement (`touch-action: none`) pour que le glissé parte au premier contact : sur un téléphone, faire défiler la page en passant par le calendrier sélectionnait une plage. Un appui long sépare les deux intentions sans retirer le glissé, et suit l'usage des agendas mobiles.

L'appui long complète la liste « Qui est disponible ? » (009) sans la remplacer : elle reste le moyen de lire les votants qui se trouve sans aide. Le focus au toucher, lui, ouvrait la bulle à chaque jour basculé sur Android, et jamais sur iPhone.
