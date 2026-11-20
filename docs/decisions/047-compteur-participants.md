# Compteur de participants

_Source : spécification `specs/002-compteur-participants/`, novembre 2026._

## Décision

La page d'un sondage affiche sous son titre le nombre de participants, pour tout visiteur, sondage ouvert ou clos : « Personne n’a encore répondu », « 1 participant », « N participants » (`participantCountLabel`, `src/lib/text.ts`). Un participant est une réponse enregistrée, avec ou sans compte : deux pseudos identiques font deux participants, et les simples visites ne sont pas comptées. Le nombre est lu dans la requête même du sondage (`getPollByPublicId`, `_count.responses`), comme dans « Mes sondages » et l'administration. Le compteur est rendu côté serveur dans une région `role="status"` (`src/app/s/[publicId]/_sections/participant-count.tsx`) et suit le direct par la relecture de page que déclenche déjà chaque événement `responses`.

## Pourquoi

Le nombre de répondants n'apparaissait que dans « Mes sondages » ; sur la page, il fallait le reconstituer en parcourant les jours, impossible dès que les votes se dispersent. Le même comptage partout rend impossible un écart entre les trois affichages. Le lire dans la requête existante ne coûte aucun aller-retour, et aucune colonne dénormalisée n'est à tenir à jour sous écritures concurrentes. Passer par la relecture de page garde le flux sans aucune donnée (constitution II) et donne au compteur le même délai et le même rattrapage que les pastilles. La région `role="status"` se tait au chargement et annonce chaque changement sans prendre le focus. Compter les visites aurait exigé un suivi des visiteurs que la constitution exclut (principe IV).
