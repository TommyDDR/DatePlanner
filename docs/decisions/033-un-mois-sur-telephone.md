# Un seul mois quand deux ne tiennent pas côte à côte

_Source : évolution après la version 0.2.0. Remplace l'empilement des deux mois de la décision 030._

## Décision

Quand le calendrier devrait montrer deux mois mais que son cadre n'offre pas 31,5rem (deux grilles de 15rem et leur écart), il n'en montre qu'un. C'est le cas d'un téléphone. Il redevient alors un calendrier d'un mois en tout : titre d'un mois, flèches d'un mois, clavier qui change de mois au bord de la grille, jours des mois voisins montrés, et mois concernés signalés dès qu'il y en a plus d'un.

La largeur est mesurée sur le cadre lui-même, pas sur la fenêtre : le calendrier vit dans des panneaux aux marges différentes. Le rendu serveur suppose deux mois ; au montage, la mesure retire le second s'il ne tient pas. Avant cela, une requête de conteneur au même seuil le masque déjà : on ne voit jamais deux mois empilés. Un écran qui change de largeur bascule dans les deux sens, en gardant en vue le mois du jour qui porte le focus.

## Pourquoi

Deux mois l'un sous l'autre doublaient la hauteur du calendrier sur un téléphone, repoussaient sous le pli le bouton d'envoi, et montraient deux titres de mois pour une seule paire de flèches. Un mois à la fois, avec les mois concernés à un toucher, se lit comme le calendrier du téléphone.
