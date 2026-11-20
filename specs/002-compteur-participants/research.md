# Phase 0 — Recherche : compteur de participants

**Spec** : [spec.md](spec.md) · **Plan** : [plan.md](plan.md) · **Date** : 2026-11-20

Aucune inconnue technique : le contexte technique ne contient aucun « NEEDS
CLARIFICATION ». Les points ci-dessous fixent les choix de conception.

---

## R1 — Source du nombre

- **Decision** : ajouter `respondents: number` à `PollView`, lu dans la requête de
  `getPollByPublicId` par `_count: { select: { responses: true } }`.
- **Rationale** : c'est exactement le comptage de « Mes sondages »
  (`src/server/polls/read.ts`) et de l'administration (`src/server/admin/polls.ts`) :
  les trois affichages ne peuvent pas se contredire (FR-006). Une seule requête, pas
  d'aller-retour en plus. Un participant = une réponse (FR-002) : toute réponse a au
  moins un vote (validation refuse une réponse vide, un retrait de jour voté est
  refusé), donc aucune réponse « fantôme » sans jour.
- **Alternatives considered** : compter les votants distincts depuis
  `getPollSynthesis` (calcul côté application, risque d'écart avec « Mes sondages »,
  et deux pseudos identiques fusionneraient à tort) ; une requête `count` séparée
  (un aller-retour de plus, sans gain) ; un compteur dénormalisé en base (migration
  et écritures concurrentes à garder, contraire au principe VI).

## R2 — Mise à jour en direct

- **Decision** : aucun code de direct nouveau. Le compteur est rendu côté serveur ;
  `LivePoll` relit déjà la page (`router.refresh()`) à chaque événement
  `responses` (création, modification, retrait, suppression par le créateur).
- **Rationale** : le bus n'émet aucune donnée (constitution II) et la page se relit
  entière ; le compteur suit le même chemin que les pastilles, donc le même délai
  (SC-003) et le même rattrapage après coupure.
- **Alternatives considered** : transporter le nombre dans l'événement SSE
  (contraire au principe « le flux ne porte aucune donnée », deux sources de vérité).

## R3 — Libellé

- **Decision** : fonction pure `participantCountLabel(count)` dans `src/lib/text.ts` :
  `0` → « Personne n'a encore répondu », sinon `plural(count, 'participant')`
  (« 1 participant », « 3 participants »). Nombre entier, sans abréviation.
- **Rationale** : réutilise `plural` (même accord que « Mes sondages ») ; le message
  à zéro reprend celui de « Qui est disponible ? », pour une page cohérente.
- **Alternatives considered** : « 0 participant » (sec, moins clair) ; abréviation
  « 1,2 k » (inutile à cette échelle, contraire à l'edge case « nombre exact »).

## R4 — Emplacement et accessibilité

- **Decision** : dans l'en-tête du sondage, sous le titre et la description, au-dessus
  du formulaire de réponse ; élément `role="status"` (région polie), stable à travers
  les relectures, `data-testid="compteur-participants"`.
- **Rationale** : visible sans défilement sur bureau (FR-001), premier élément lu
  après le titre. Un `role="status"` présent dès le rendu n'est pas annoncé au
  chargement mais l'est à chaque changement de texte, sans prendre le focus
  (FR-007). React conserve le nœud lors d'un `router.refresh()` : seul le texte change.
- **Alternatives considered** : dans la section « Qui est disponible ? » (sous le
  calendrier, hors de vue au chargement sur téléphone) ; `aria-live="assertive"`
  (interrompt la lecture, disproportionné).
