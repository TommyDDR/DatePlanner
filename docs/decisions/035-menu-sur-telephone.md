# Menu de l'en-tête sur téléphone

_Source : évolution après la version 0.3.0._

## Décision

Sous 640 px de large, un compte connecté ne voit plus ses liens dans le bandeau : « Mes sondages », « Nouveau sondage » et son nom passent dans un menu, ouvert par un bouton à trois traits placé à droite de la bascule de thème. Celle-ci reste dans le bandeau à toutes les largeurs. Sans session, « Connexion » reste seul dans le bandeau, sans menu. Au-delà de 640 px, rien ne change.

Le menu est un `<details>` : il s'ouvre au toucher comme au clavier, et même sans JavaScript. Le script ne fait que le refermer quand on suit un de ses liens, qu'on presse Échap (le focus revient alors au bouton) ou qu'on touche ailleurs dans la page.

## Pourquoi

Sur un téléphone, « Mes sondages » était masqué faute de place, et n'avait pas d'autre accès depuis l'en-tête. Trois liens et le thème ne tiennent pas à côté de la marque ; un menu les rend tous accessibles sans rogner le nom du compte. Le thème reste visible parce qu'il se bascule d'un geste et vaut aussi sans compte.
