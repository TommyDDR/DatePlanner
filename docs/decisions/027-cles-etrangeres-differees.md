# Clés étrangères différées

_Source : implémentation._

## Décision

Les clés `vote → poll_day` et « date retenue → jour du sondage » sont `DEFERRABLE INITIALLY DEFERRED`, sans suppression en cascade : un jour voté ne se supprime pas seul, mais la suppression d'un sondage ou d'un compte emporte tout.

## Pourquoi

PostgreSQL vérifie chaque cascade comme une instruction séparée : avec `RESTRICT` ou un `NO ACTION` immédiat, la cascade du sondage vers ses jours échouait sur les votes que la cascade vers les réponses n'avait pas encore retirés. Différée, la vérification a lieu à la validation, quand tout est parti ; un jour voté retiré seul échoue toujours.
