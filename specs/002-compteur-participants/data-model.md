# Phase 1 — Modèle de données : compteur de participants

**Spec** : [spec.md](spec.md) · **Plan** : [plan.md](plan.md)

Aucune table, colonne ni migration. Le modèle de la fonctionnalité 001
([data-model](../001-date-poll/data-model.md)) est inchangé.

## Valeur dérivée

### `PollView.respondents`

- **Type** : entier ≥ 0.
- **Définition** : nombre de lignes `response` du sondage (`_count.responses`).
- **Règles** :
  - une réponse avec compte et une réponse sans compte comptent chacune pour un
    (FR-002) ;
  - deux pseudos identiques = deux réponses = deux participants ;
  - modifier les jours d'une réponse ne change pas le nombre ;
  - créer une réponse : +1 ; la retirer (répondant) ou la supprimer (créateur) : −1 ;
  - clore ou rouvrir le sondage : sans effet.
- **Cohérence** : même définition que `MyPollRow.respondents` et que la ligne
  d'administration (FR-006).

## Libellé dérivé

`participantCountLabel(count: number): string` (pur)

| `count` | Libellé |
|---------|---------|
| 0 | Personne n'a encore répondu |
| 1 | 1 participant |
| n > 1 | n participants |
