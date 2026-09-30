# Mise à jour en direct

_Source : research.md, R8._

## Décision

Server-Sent Events sur `GET /api/s/<identifiant>/flux`, alimentés par `LISTEN/NOTIFY` (canal `dateplanner_live`). Un événement ne porte que `{ kind, at }` ; la page se relit par un rendu serveur ordinaire (`router.refresh()`), avec ses contrôles d'accès, y compris à la reconnexion. Battement toutes les 25 s, flux fermé au bout de 55 min, au plus 6 flux simultanés par adresse.

## Pourquoi

Moins de 5 s pour voir un vote (SC-003), et le flux ne transporte rien qu'un visiteur du lien ne puisse déjà lire : un seul chemin de lecture à sécuriser. Un seul processus Node, pas d'intermédiaire de messages. Écartés : WebSocket (bidirectionnel inutile), interrogation périodique (charge et latence), votes transportés dans l'événement (deux chemins de lecture).
