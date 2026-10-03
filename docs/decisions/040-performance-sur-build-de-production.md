# Performance mesurée sur un build de production

_Source : correction après la version 0.5.0._

## Décision

SC-005 - un sondage de 60 jours et 100 répondants affiché complet en moins de 2 s sur un réseau 4G - se mesure sur un build de production servi par `next start`, et non plus sur le serveur de développement des autres parcours. `e2e/performance.spec.ts` a sa configuration, `playwright.performance.config.ts`, et sa commande, `npm run e2e:perf` ; `npm run e2e` l'ignore. La configuration refait le build à chaque lancement, dans `.next/performance`, avec l'adresse réelle et un éditeur factice comme le build de l'intégration continue. L'intégration continue joue cette mesure après les autres parcours. Le seuil reste 2 s.

## Pourquoi

Le critère porte sur le service réel. Mesurée sur `next dev`, la même page attendait 0,8 s le serveur en local et 1,5 s sur un runner de GitHub, pour un affichage complet de 1,1 s et 2,5 s : l'échec dépendait de la machine, pas du code. Sur le build de production, le serveur répond en moins de 0,1 s et la page s'affiche complète en 0,3 s. Relever le seuil aurait laissé passer une vraie régression sur un poste rapide ; refaire le build évite de mesurer un build oublié.
