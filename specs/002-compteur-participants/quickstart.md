# Quickstart — valider le compteur de participants

**Spec** : [spec.md](spec.md) · **Contrat** : [contracts/pages.md](contracts/pages.md) ·
**Modèle** : [data-model.md](data-model.md)

## Prérequis

- Base PostgreSQL de développement et `.env` en place (voir `README.md`).
- `npm ci`, puis `npm run db:migrate` (aucune migration nouvelle attendue).

## Contrôles automatisés

```bash
npm run typecheck
npm run lint
npm test            # unitaires + intégration sur vraie base
npm run build
npm run e2e         # bout en bout, dont direct et accessibilité
```

## Couverture attendue par exigence

| Exigence | Test | Attendu |
|----------|------|---------|
| FR-004 | `tests/unit/text.test.ts` | 0 → « Personne n'a encore répondu », 1 → « 1 participant », 3 → « 3 participants », 1234 → « 1234 participants » |
| FR-002, FR-006 | `tests/integration/responses.test.ts` | `respondents` = nombre de réponses (avec et sans compte, pseudos identiques) et = valeur de « Mes sondages » |
| FR-002 | idem | modifier ses jours : inchangé ; retrait par le répondant et suppression par le créateur : −1 |
| FR-001, FR-003 | `e2e/live-updates.spec.ts` ou `e2e/respond.spec.ts` | compteur visible sans interaction, pour un visiteur anonyme, sondage clos compris |
| FR-005 | `e2e/live-updates.spec.ts` | second navigateur : N → N+1 en < 5 s sans recharger, puis −1 après suppression par le créateur |
| FR-007 | `e2e/accessibility.spec.ts` | `role="status"` présent, axe sans violation, deux thèmes |
| FR-008 | revue + test d'intégration | le compteur ne rend qu'un entier |

## Vérification manuelle

1. `npm run dev`, créer un sondage : l'en-tête affiche « Personne n'a encore répondu ».
2. Ouvrir le lien dans une fenêtre privée, répondre avec un pseudo : les deux
   fenêtres affichent « 1 participant », la première sans rechargement.
3. Répondre une seconde fois depuis un autre navigateur : « 2 participants ».
4. Modifier ses jours dans la fenêtre privée : le nombre ne change pas.
5. Côté créateur, supprimer une réponse : « 1 participant » partout.
6. Clore le sondage : le compteur reste affiché.
7. Largeur 320 px, thème sombre puis clair : une ligne lisible, pas de défilement
   horizontal.
8. Lecteur d'écran (NVDA) : une nouvelle réponse dans l'autre fenêtre est annoncée
   sans déplacer le focus.
