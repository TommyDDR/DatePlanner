# Jetons de contraste propres à DatePlanner

_Source : implémentation._

## Décision

Deux jetons s'ajoutent à ceux de laserit.fr, sans en modifier aucun : `--color-text-subtle` pour le texte discret mais informatif, et `--color-danger` pour le texte d'une erreur ou d'une action destructrice. `text-faint` et `rust` restent aux éléments décoratifs, inactifs, aux bordures et aux barrés. Un jour d'un mois voisin se distingue par ce texte discret, plus par de la transparence. Les liens pris dans une phrase sont soulignés au repos.

## Pourquoi

En sombre, `text-faint` n'offre que 3,3:1 et `rust` 3,8:1 sur la matière ; axe les refusait (SC-009), comme un lien que seule sa couleur distingue du texte qui l'entoure. Les jetons de laserit.fr restent identiques, ce qu'un test vérifie (FR-031).
