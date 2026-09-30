# Stratégie de test

_Source : research.md, R16._

## Décision

Vitest pour les modules purs et pour l'intégration contre un vrai PostgreSQL 17 ; Playwright (Chromium) pour les parcours ; axe pour le contraste et les rôles dans les deux thèmes. Intégration continue calquée sur laserit.fr : audit, types, lint, tests, build, bout en bout. Un test compare les jetons visuels à ceux de laserit.fr ; un test d'hygiène refuse tout secret versionné. Seule dépendance hors pile laserit.fr : `@axe-core/playwright`, en développement.

## Pourquoi

Constitution III : chaque exigence porte au moins un test, et un test contre une imitation de base ne prouverait rien du comportement réel. axe rend le contraste vérifiable à chaque poussée, ce qu'un contrôle manuel ne rejouerait pas.
