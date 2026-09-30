# En-têtes de sécurité et indexation

_Source : research.md, R14._

## Décision

`proxy.ts` tire un nonce par requête et pose la CSP (`script-src 'self' 'nonce-…'`, sans `'unsafe-inline'`, `form-action 'self'`) ; redirection 308 vers HTTPS de toute requête reçue en clair, hors hôte local ; `noindex` par défaut, `robots.txt` interdisant `/s/` ; seuls l'accueil et les pages légales s'indexent. La destination après connexion passe par `safeInternalPath`.

## Pourquoi

Constitution I et FR-035, FR-037 : un sondage n'est lisible que par qui a le lien, et ne doit pas l'être par un moteur.
