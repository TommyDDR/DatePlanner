# Calendrier sur deux mois, à proportions fixes

_Source : évolution après la version 0.1.0._

## Décision

À la création d'un sondage et à l'ajout de jours, le calendrier montre deux mois consécutifs. À la réponse, il en montre un si tous les jours proposés à venir tiennent dans un mois, deux sinon ; en consultation, la même règle porte sur tous les jours proposés. Les flèches font glisser la fenêtre d'un mois, et une fenêtre qui finirait sur un mois vide recule d'un mois quand le précédent a des jours à montrer.

À deux mois, chaque grille ne rend que ses propres jours ; les cases des jours voisins restent, vides, pour garder six rangées. Une colonne ou une semaine n'avance que les jours de sa grille, et ses boutons portent le nom du mois. Les mois signalés au-dessus du calendrier ne s'affichent que s'il y en a plus que de mois montrés.

Chaque grille est plafonnée à 21rem (1,75rem de numéros de semaine, sept cases d'au plus 2,75rem) et centrée ; le cadre du calendrier se limite à la largeur de ses grilles. Deux mois passent l'un sous l'autre sous 15rem par mois ; la décision 033 remplace cet empilement par un seul mois.

## Pourquoi

Proposer des jours revient souvent à enjamber une fin de mois : deux mois évitent d'aller et venir. Pour répondre, un seul mois suffit quand tout y tient, et un second vide ne ferait que distraire.

Une grille étirée à toute la largeur écartait les jours les uns des autres sans agrandir les cases : le calendrier ne se lisait plus comme un calendrier. Montrer les jours voisins dans deux grilles côte à côte aurait fait apparaître chaque fin de mois deux fois, avec deux boutons pour un même jour.
