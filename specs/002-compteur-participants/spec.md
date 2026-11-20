# Feature Specification: Compteur de participants

**Feature Branch**: `feat/compteur-participants`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "je veux ajouter un afficheur (compteur) pour connaitre le nombre de participants facilement"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Voir d'un coup d'œil combien de personnes ont répondu (Priority: P1)

Toute personne qui consulte un sondage (créateur, répondants, simples visiteurs
du lien) voit, sur la page du sondage, un compteur indiquant le nombre de
participants, c'est-à-dire le nombre de réponses enregistrées. Aujourd'hui, ce
nombre n'apparaît que dans « Mes sondages » ; sur la page du sondage, il faut le
reconstituer en survolant les jours, ce qui est impossible dès que les votes se
répartissent sur plusieurs jours.

**Why this priority**: c'est le besoin exprimé. Le créateur sait s'il peut
décider ou s'il doit relancer, et un répondant voit si le groupe a déjà répondu.

**Independent Test**: ouvrir un sondage ayant trois réponses : le compteur
affiche « 3 participants » sans aucune interaction.

**Acceptance Scenarios**:

1. **Given** un sondage avec trois réponses, **When** on ouvre sa page, **Then**
   le compteur affiche « 3 participants ».
2. **Given** un sondage avec une seule réponse, **When** on ouvre sa page,
   **Then** le compteur affiche « 1 participant » (singulier).
3. **Given** un sondage sans aucune réponse, **When** on ouvre sa page, **Then**
   le compteur indique qu'aucune personne n'a encore répondu.
4. **Given** deux réponses dont les votes portent sur des jours tous différents,
   **When** on ouvre la page, **Then** le compteur affiche « 2 participants »
   (il compte des personnes, pas des votes).
5. **Given** un sondage clos, **When** on ouvre sa page, **Then** le compteur
   reste affiché avec le nombre final de participants.
6. **Given** un visiteur non connecté, **When** il ouvre un sondage réservé aux
   répondants connectés, **Then** il voit le compteur comme tout autre visiteur.

---

### User Story 2 - Compteur à jour en direct (Priority: P2)

Quand quelqu'un valide une nouvelle réponse, retire la sienne, ou que le
créateur supprime une réponse, le compteur de tous les écrans ouverts sur ce sondage se met à jour
sans rechargement, comme les pastilles du calendrier.

**Why this priority**: sans cela le compteur contredit le calendrier, qui se
met déjà à jour en direct ; mais la story 1 apporte seule l'essentiel.

**Independent Test**: ouvrir le même sondage dans deux navigateurs, répondre
dans le premier : le compteur du second passe de N à N+1 en quelques secondes.

**Acceptance Scenarios**:

1. **Given** deux écrans ouverts sur un sondage à 2 participants, **When** une
   nouvelle personne valide sa réponse sur l'un, **Then** les deux affichent
   « 3 participants » sans rechargement.
2. **Given** un écran ouvert sur un sondage à 3 participants, **When** le
   créateur supprime une réponse, **Then** l'écran affiche « 2 participants »
   sans rechargement.
3. **Given** un participant qui modifie les jours de sa réponse, **When** il
   valide, **Then** le compteur ne change pas.
4. **Given** un écran ouvert sur un sondage à 3 participants, **When** un
   participant retire sa propre réponse, **Then** l'écran affiche
   « 2 participants » sans rechargement.

---

### Edge Cases

- Un participant retire sa propre réponse : il n'est plus compté, comme pour
  une suppression par le créateur.
- Le créateur retire du sondage un jour proposé que personne n'a voté : le
  compteur ne change pas.
- Deux répondants sans compte saisissent le même pseudo : ce sont deux réponses,
  donc deux participants.
- Un répondant connecté dont l'appareil porte aussi une réponse anonyme au même
  sondage : chaque réponse enregistrée compte pour un.
- Grand nombre de réponses (plusieurs centaines) : le compteur affiche le nombre
  exact, sans abréviation, et reste lisible sur téléphone sans défilement
  horizontal.
- La mise à jour en direct est momentanément interrompue : le compteur garde la
  dernière valeur connue et se recale au retour de la connexion ou au
  rechargement, comme le calendrier.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La page d'un sondage DOIT afficher le nombre de participants,
  visible sans interaction (ni survol, ni clic, ni défilement sur un écran de
  bureau).
- **FR-002**: Un participant DOIT correspondre à une réponse enregistrée au
  sondage, quel que soit le nombre de jours cochés et que le répondant soit
  connecté ou non.
- **FR-003**: Le compteur DOIT être visible de toute personne autorisée à voir
  la synthèse des votes du sondage (créateur, répondants, visiteurs du lien),
  dans tous les états du sondage (ouvert, clos).
- **FR-004**: Le libellé DOIT accorder le nombre : « 1 participant »,
  « N participants » au-delà, et un message explicite quand il n'y a aucune
  réponse.
- **FR-005**: Le compteur DOIT se mettre à jour sans rechargement, sur tous les
  écrans ouverts, à chaque ajout ou suppression de réponse, dans le même délai
  que les pastilles du calendrier.
- **FR-006**: Le compteur DOIT toujours être cohérent avec les réponses
  enregistrées et avec le nombre de répondants affiché dans « Mes sondages » et
  dans l'administration pour le même sondage.
- **FR-007**: Le compteur DOIT être annoncé aux technologies d'assistance
  (lecteur d'écran), y compris lors d'une mise à jour en direct, sans voler le
  focus.
- **FR-008**: Le compteur NE DOIT exposer que le nombre de participants ; il
  n'ajoute aucune donnée personnelle à ce que la page montre déjà.

### Key Entities

- **Réponse** (existante) : réponse d'une personne à un sondage (pseudo ou
  compte, jours cochés). Le nombre de participants est le nombre de réponses
  du sondage ; aucune donnée nouvelle n'est stockée.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sur la page d'un sondage, toute personne connaît le nombre de
  participants en moins de 2 secondes, sans aucune action.
- **SC-002**: Dans 100 % des cas testés, le compteur égale le nombre de réponses
  enregistrées et le nombre affiché dans « Mes sondages ».
- **SC-003**: Après une nouvelle réponse ou une suppression, les autres écrans
  ouverts affichent le nouveau nombre en moins de 5 secondes.
- **SC-004**: Le compteur reste lisible dans les deux thèmes et sur un écran de
  téléphone, sans défilement horizontal.

## Assumptions

- « Participants » désigne les personnes ayant enregistré une réponse ; les
  simples visiteurs du lien qui n'ont pas répondu ne sont pas comptés (aucun
  suivi des visites, conformément au principe de données minimales).
- Le compteur vit sur la page du sondage ; « Mes sondages » et
  l'administration affichent déjà ce nombre et ne changent pas.
- Le nombre de participants est déjà public pour qui voit la synthèse (il se
  déduit des noms au survol) ; l'afficher ne crée pas de nouvelle exposition.
- Le mécanisme de mise à jour en direct existant du calendrier est réutilisé ;
  aucune nouvelle brique n'est nécessaire.
- Hors périmètre : liste nominative des participants, nombre de votes par
  personne, historique de l'évolution du nombre.
