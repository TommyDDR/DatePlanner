# Nom de domaine

_Source : enregistrement de `dateplanner.fr` chez OVH, octobre 2026._

## Décision

Le service est servi sur `https://dateplanner.fr`, seule adresse publique (`SITE_DOMAIN`, `NEXT_PUBLIC_SITE_URL`) : liens des emails, métadonnées, retour de la connexion Google. `www.dateplanner.fr` et l'ancienne adresse `dateplanner.laserit.fr` restent résolues et sont renvoyées en permanence par Traefik sur `https://dateplanner.fr`, chemin compris (`deploy/traefik/dateplanner.yml`). Next ne connaît que la nouvelle adresse

## Pourquoi

un domaine propre dit ce qu'est le service sans le rattacher à laserit.fr, qu'il ne fait que côtoyer sur l'hyperviseur. Les liens de sondage déjà partagés et ceux des emails envoyés portent l'ancienne adresse : la couper les casserait. Les renvoyer au proxy plutôt que dans Next garde une seule adresse à l'application, donc un seul cookie de session et un seul URI de retour chez Google ; une session ouverte sur l'ancienne adresse est perdue une fois, à la première visite
