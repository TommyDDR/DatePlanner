# Reconnaître un répondant sans compte

_Source : research.md, R6._

## Décision

Un cookie d'appareil `dp_appareil` (`HttpOnly`, `Secure`, `SameSite=Lax`, 13 mois), jeton de 256 bits posé à la première réponse sans compte. La réponse garde l'empreinte SHA-256 du jeton, unique par sondage ; la retrouver, la modifier ou la retirer exige un cookie dont l'empreinte correspond.

## Pourquoi

Une réponse par appareil et navigateur, modifiable depuis lui seul (FR-018, FR-019). Une fuite de la base ne permet pas de se faire passer pour un répondant. Cookie strictement nécessaire au service demandé : pas de consentement. Écartés : `localStorage` (lisible de tout script, absent des requêtes), l'empreinte du navigateur (un traceur), le lien personnel de modification (écarté à la clarification).
