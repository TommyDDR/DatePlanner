# Feature Specification: DatePlanner — sondages de dates

**Feature Branch**: `feat/planning-rdv`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description:

> Je veux un nouveau service sur mon serveur. Celui-ci permet à des utilisateurs
> de créer des sondages de date. Pour créer un sondage, l'utilisateur doit créer
> un compte (compte local au site / connexion via Google). Un sondage possède un
> titre (obligatoire), une description (facultatif) et un calendrier. Le créateur
> du sondage sélectionne des plages de jours (1 jour minimum obligatoire). Une
> fois créé, un lien est généré pour être partagé. N'importe qui peut répondre au
> sondage, on peut soit se connecter, soit entrer manuellement un nom/pseudo pour
> répondre. Quand on répond au sondage, toutes les dates non sélectionnées par le
> créateur sont interdites. L'utilisateur choisit ses dates parmi celles
> disponibles puis valide. Le calendrier est alors mis à jour pour tout le monde
> avec une pastille dans les jours (qui ont au moins un vote) avec le nombre de
> votes pour ce jour. Un survol du jour permet de voir la liste des personnes
> ayant voté pour ce jour. Comme sur le projet exemple, il faut un thème
> clair/sombre (celui du système par défaut). Garder le thème global du projet
> d'exemple. Faire une landing page impressionnante. Se baser sur le calendrier
> de prise de RDV déjà mis en place dans le site laserit.fr. Service autonome,
> exposé sur dateplanner.laserit.fr.

## Clarifications

### Session 2026-09-30

- Q: Après validation, un répondant peut-il modifier ou retirer sa réponse, et comment un répondant sans compte est-il reconnu à son retour ? → A: Oui : un répondant connecté par son compte, un répondant sans compte depuis le même appareil et le même navigateur.
- Q: Le créateur peut-il clore son sondage et désigner la date retenue ? → A: Oui : clore et rouvrir ; à la clôture, il peut désigner une date retenue, mise en avant pour tous.
- Q: Après les premiers votes, le créateur peut-il changer les jours proposés, et que deviennent les votes d'un jour retiré ? → A: Ajout de jours toujours possible ; retrait seulement d'un jour sans aucun vote.
- Q: Le créateur peut-il supprimer la réponse d'un participant ? → A: Oui, après confirmation ; il peut aussi exiger, sondage par sondage, que les répondants soient connectés.
- Q: Le service doit-il envoyer des emails quand un sondage bouge ? → A: Oui : au créateur pour les nouvelles réponses (regroupées, option du sondage activée par défaut) ; aux répondants connectés à l'annonce de la date retenue.
- Q: Un répondant connecté dont l'appareil porte déjà une réponse anonyme au même sondage, que voit-il ? → A: Connecté, il voit le sondage avec son compte ; déconnecté, il le voit en mode anonyme avec la réponse de son appareil.
- Q: Quand part le premier résumé des nouvelles réponses ? → A: 15 minutes après la première nouvelle réponse, puis au plus un toutes les 30 minutes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Créer un sondage et obtenir son lien de partage (Priority: P1)

Une personne qui veut fixer une date avec d'autres crée un compte (adresse email
et mot de passe), puis crée un sondage : elle saisit un titre, éventuellement une
description, et choisit dans un calendrier les jours qu'elle propose. Elle peut
cocher des jours un par un ou en sélectionner des plages entières. À la
validation, le service lui donne un lien unique qu'elle copie en un geste et
envoie à ses invités.

**Why this priority**: sans sondage publié, rien d'autre n'existe. C'est le point
d'entrée de toute la valeur du service.

**Independent Test**: créer un compte, créer un sondage avec trois jours, copier
le lien, l'ouvrir dans une fenêtre privée : le titre, la description et les trois
jours proposés s'affichent.

**Acceptance Scenarios**:

1. **Given** un visiteur sans compte, **When** il demande à créer un sondage,
   **Then** il est invité à créer un compte ou à se connecter, puis ramené à la
   création du sondage.
2. **Given** un utilisateur connecté sur le formulaire de création, **When** il
   saisit un titre et sélectionne au moins un jour puis valide, **Then** le
   sondage est créé et son lien de partage lui est présenté avec un bouton de
   copie.
3. **Given** le formulaire de création, **When** l'utilisateur valide sans titre
   ou sans aucun jour, **Then** la création est refusée et le champ manquant est
   signalé sans perte de ce qui a déjà été saisi.
4. **Given** le calendrier de création, **When** l'utilisateur fait glisser le
   pointeur d'un jour à un autre, **Then** toute la plage de jours est
   sélectionnée (ou désélectionnée si le premier jour l'était déjà).
5. **Given** le calendrier de création, **When** l'utilisateur clique sur
   l'initiale d'un jour de la semaine ou sur un numéro de semaine, **Then** tous
   les jours correspondants visibles sont ajoutés, ou retirés si l'un d'eux était
   déjà sélectionné.
6. **Given** le calendrier de création, **When** l'utilisateur tente de
   sélectionner un jour passé, **Then** le jour reste non sélectionnable.

---

### User Story 2 - Répondre à un sondage, avec ou sans compte (Priority: P2)

Une personne qui reçoit le lien l'ouvre. Elle voit le titre, la description et le
calendrier où seuls les jours proposés par le créateur sont sélectionnables. Elle
choisit soit de se connecter (son nom vient alors de son compte), soit de saisir
un nom ou un pseudo. Elle coche les jours qui lui conviennent puis valide.

**Why this priority**: un sondage sans réponses n'a pas de valeur. Répondre doit
être possible sans créer de compte pour ne perdre aucun participant.

**Independent Test**: à partir d'un sondage existant, ouvrir le lien sans être
connecté, saisir un pseudo, cocher deux jours proposés, valider : la réponse est
enregistrée et les deux jours portent une pastille « 1 ».

**Acceptance Scenarios**:

1. **Given** un sondage ouvert par un visiteur non connecté, **When** il saisit
   un pseudo, coche des jours proposés et valide, **Then** sa réponse est
   enregistrée sous ce pseudo.
2. **Given** un sondage ouvert par un utilisateur connecté, **When** il coche des
   jours et valide, **Then** sa réponse est enregistrée sous le nom de son compte
   sans qu'il ait à saisir de pseudo.
3. **Given** le calendrier de réponse, **When** le répondant tente de choisir un
   jour non proposé par le créateur, **Then** ce jour est visible mais ne peut pas
   être sélectionné.
4. **Given** une réponse envoyée qui contiendrait un jour non proposé (requête
   fabriquée hors de l'interface), **When** le service la reçoit, **Then** elle
   est refusée en entier.
5. **Given** un répondant non connecté, **When** il valide sans pseudo (ou avec
   un pseudo fait uniquement d'espaces), **Then** la validation est refusée et le
   champ pseudo est signalé.
6. **Given** un répondant, **When** il valide sans avoir coché aucun jour,
   **Then** la validation est refusée avec un message explicite.
7. **Given** un répondant qui a déjà répondu à ce sondage, **When** il revient
   sur le lien (connecté au même compte, ou sans compte depuis le même appareil
   et le même navigateur), **Then** il retrouve ses jours cochés et peut les
   modifier ou retirer sa réponse.
8. **Given** un sondage dont le créateur exige un compte, **When** un visiteur
   non connecté l'ouvre, **Then** il voit le sondage et la synthèse des votes,
   mais aucun champ pseudo : il est invité à se connecter pour répondre.

---

### User Story 3 - Voir qui est disponible, à jour pour tout le monde (Priority: P3)

Toute personne qui consulte le sondage (créateur, répondants, simples visiteurs
du lien) voit sur chaque jour ayant au moins un vote une pastille indiquant le
nombre de votes. En survolant un jour, elle voit la liste des personnes ayant
voté pour ce jour. Quand quelqu'un valide sa réponse, tous les écrans ouverts sur
ce sondage se mettent à jour sans rechargement.

**Why this priority**: c'est la synthèse qui permet de décider de la date ; elle
complète le parcours minimal créer → répondre → décider.

**Independent Test**: ouvrir le même sondage dans deux navigateurs, répondre
dans le premier : le second affiche la nouvelle pastille en quelques secondes,
et le survol du jour liste le nom du répondant.

**Acceptance Scenarios**:

1. **Given** un sondage où trois personnes ont voté pour le même jour, **When**
   on consulte le calendrier, **Then** ce jour porte une pastille « 3 ».
2. **Given** un jour sans aucun vote, **When** on consulte le calendrier,
   **Then** ce jour ne porte aucune pastille.
3. **Given** un jour avec des votes, **When** on le survole au pointeur, ou qu'on
   y place le focus au clavier, **Then** la liste des noms des votants de ce jour
   s'affiche.
4. **Given** un écran tactile sans survol, **When** l'utilisateur consulte un
   jour avec des votes, **Then** la liste des votants reste accessible par un
   geste tactile qui ne modifie pas sa propre sélection.
5. **Given** deux personnes qui consultent le même sondage, **When** l'une valide
   une réponse, **Then** l'autre voit les pastilles mises à jour sans recharger
   la page.

---

### User Story 4 - Se connecter avec un compte Google (Priority: P4)

Au lieu de créer un mot de passe, une personne peut se connecter avec son compte
Google, pour créer un sondage comme pour y répondre sous son nom.

**Why this priority**: réduit la friction à l'inscription, mais le compte local
suffit au parcours minimal.

**Independent Test**: depuis la page de connexion, choisir Google, accepter :
l'utilisateur est connecté et peut créer un sondage.

**Acceptance Scenarios**:

1. **Given** un visiteur sans compte, **When** il se connecte avec Google,
   **Then** un compte est créé à partir de son identité Google (nom et adresse
   email vérifiée) et il est connecté.
2. **Given** un compte local existant avec la même adresse email, déjà prouvée
   (un lien envoyé à cette adresse a été utilisé), **When** son titulaire se
   connecte avec Google pour la première fois, **Then** l'identité Google est
   rattachée à ce compte existant, sans créer de doublon, et son mot de passe
   reste valable.
3. **Given** un compte local existant avec la même adresse email, jamais
   prouvée, **When** quelqu'un se connecte avec le compte Google de cette
   adresse, **Then** l'identité Google est rattachée au compte, son mot de passe
   est effacé et toutes ses autres sessions sont fermées ; le titulaire peut en
   redéfinir un par « mot de passe oublié ».
4. **Given** un visiteur qui annule sur la page de Google, **When** il revient
   sur le service, **Then** il n'est pas connecté et un message neutre
   l'indique.

---

### User Story 5 - Gérer ses sondages (Priority: P5)

Un utilisateur connecté retrouve la liste de ses sondages (titre, nombre de
répondants, date de création, état), rouvre le lien de chacun, modifie le titre
ou la description, ajoute des jours, supprime une réponse indésirable, exige si
besoin que les répondants soient connectés, clôt le sondage en désignant la
date retenue, et peut supprimer un sondage.

**Why this priority**: indispensable dès qu'on a plusieurs sondages, mais
chaque sondage reste utilisable par son seul lien sans cette page.

**Independent Test**: créer deux sondages, ouvrir « Mes sondages » : les deux y
figurent avec leur nombre de répondants ; en supprimer un : son lien répond
« sondage introuvable ».

**Acceptance Scenarios**:

1. **Given** un utilisateur connecté qui a créé des sondages, **When** il ouvre
   « Mes sondages », **Then** il voit chacun avec son titre, son nombre de
   répondants et sa date de création, les plus récents en premier.
2. **Given** le créateur d'un sondage, **When** il modifie le titre ou la
   description, **Then** la modification est visible par tous les porteurs du
   lien.
3. **Given** le créateur d'un sondage, **When** il le supprime après
   confirmation, **Then** le sondage et toutes ses réponses disparaissent et le
   lien répond « sondage introuvable ».
4. **Given** le créateur d'un sondage ouvert, **When** il le clôt en désignant
   un des jours proposés comme date retenue, **Then** plus aucune réponse n'est
   acceptée ni modifiable, et la date retenue est mise en avant pour tous les
   porteurs du lien.
5. **Given** un sondage clos, **When** son créateur le rouvre, **Then** les
   réponses sont de nouveau acceptées et la date retenue n'est plus affichée.
6. **Given** un sondage qui a déjà reçu des votes, **When** son créateur
   ajoute des jours, **Then** ils deviennent sélectionnables pour tous les
   répondants, sans toucher aux réponses existantes.
7. **Given** un sondage dont un jour proposé porte au moins un vote, **When**
   son créateur tente de retirer ce jour, **Then** le retrait est refusé et le
   jour reste proposé ; un jour sans vote, lui, peut être retiré.
8. **Given** le créateur d'un sondage, **When** il supprime la réponse d'un
   participant après confirmation, **Then** elle disparaît et les pastilles
   sont mises à jour pour tous.
9. **Given** le créateur d'un sondage sans compte exigé, **When** il active
   l'option « répondants connectés uniquement », **Then** les nouveaux
   visiteurs non connectés ne peuvent plus répondre, et les réponses sans
   compte déjà données restent affichées.
10. **Given** un utilisateur qui n'est pas le créateur, **When** il tente de
    modifier ou supprimer un sondage ou une réponse qui n'est pas la sienne,
    **Then** l'action est refusée comme si l'objet n'existait pas.
11. **Given** un sondage aux notifications activées, **When** cinq personnes
    répondent en dix minutes, **Then** le créateur reçoit un seul email qui les
    liste toutes.
12. **Given** un sondage auquel trois répondants connectés et deux sans compte
    ont répondu, **When** le créateur le clôt en désignant une date retenue,
    **Then** les trois répondants connectés reçoivent un email annonçant cette
    date.

---

### User Story 6 - Découvrir le service sur une page d'accueil marquante (Priority: P6)

Un visiteur qui arrive sur dateplanner.laserit.fr découvre en quelques secondes
ce que fait le service grâce à une page d'accueil visuellement marquante : une
démonstration animée d'un calendrier qui se remplit de votes, les trois étapes
(je propose des jours, je partage le lien, chacun coche ses disponibilités), et
un appel à créer son premier sondage.

**Why this priority**: porte la première impression et la conversion, mais
n'est pas nécessaire au fonctionnement d'un sondage partagé par lien.

**Independent Test**: ouvrir la page d'accueil sur ordinateur et sur téléphone :
l'animation se joue, les trois étapes sont lisibles, le bouton « Créer un
sondage » mène à la création (ou à l'inscription si non connecté).

**Acceptance Scenarios**:

1. **Given** un visiteur sur la page d'accueil, **When** la page s'affiche,
   **Then** il voit une démonstration animée d'un sondage de dates et un appel
   à l'action principal visible sans défiler.
2. **Given** un visiteur dont le système demande de réduire les animations,
   **When** il ouvre la page d'accueil, **Then** la démonstration est présentée
   sans mouvement (ou avec un mouvement minimal) et reste compréhensible.
3. **Given** un visiteur sur téléphone, **When** il parcourt la page d'accueil,
   **Then** tout le contenu tient dans la largeur de l'écran, sans défilement
   horizontal.

---

### User Story 7 - Thème clair ou sombre (Priority: P7)

À la première visite, le service suit le thème clair ou sombre du système du
visiteur. Un bouton permet de basculer entre clair et sombre ; ce choix est
retenu sur l'appareil pour les visites suivantes, sans qu'il soit nécessaire
d'être connecté. L'identité visuelle générale (palette, typographie, style des
composants) reprend celle du site laserit.fr.

**Why this priority**: confort et cohérence visuelle, sans effet sur le parcours
fonctionnel.

**Independent Test**: régler le système en sombre, ouvrir le site : il s'affiche
en sombre ; basculer en clair, recharger : il reste clair.

**Acceptance Scenarios**:

1. **Given** une première visite avec un système réglé en sombre, **When** la
   page s'affiche, **Then** elle est en thème sombre dès le premier affichage,
   sans flash du thème clair.
2. **Given** un visiteur qui a choisi le thème clair, **When** il revient plus
   tard sur le même appareil, **Then** le thème clair est conservé, quel que
   soit le réglage du système.
3. **Given** l'un ou l'autre thème, **When** on consulte n'importe quelle page,
   **Then** les textes et les pastilles de votes respectent un contraste
   suffisant pour être lus.

---

### Edge Cases

- Lien de sondage inexistant, mal formé ou supprimé : page « sondage
  introuvable », sans indiquer si le sondage a existé.
- Jours proposés tous passés : le sondage reste consultable (pastilles et
  votants visibles) mais n'accepte plus de réponse ; un jour proposé passé
  n'est plus sélectionnable par un nouveau répondant.
- Sondage clos ouvert par un répondant : la page annonce la clôture (et la
  date retenue s'il y en a une) ; le calendrier est en consultation seule, y
  compris pour qui avait déjà répondu.
- Réponse envoyée juste après la clôture (page restée ouverte) : refusée, avec
  un message indiquant que le sondage vient d'être clos.
- Deux répondants sans compte saisissent le même pseudo : les deux réponses
  sont acceptées et affichées ; un répondant connecté se distingue visuellement
  d'un pseudo saisi.
- Répondant sans compte qui revient depuis un autre appareil, ou après avoir
  effacé les données de son navigateur : il n'est pas reconnu ; une nouvelle
  réponse de sa part s'ajoute à l'ancienne.
- Répondant sans compte qui se connecte ensuite sur le même appareil : connecté,
  il voit le sondage avec son compte (sa réponse anonyme n'y est ni reprise ni
  modifiable, et répondre sous son compte crée une seconde réponse) ; déconnecté,
  il retrouve le sondage en mode anonyme, avec la réponse anonyme de cet
  appareil.
- Compte local dont l'adresse n'a jamais été prouvée, rattaché ensuite à Google :
  son mot de passe est effacé et ses autres sessions fermées. Sans cela, un
  tiers qui aurait inscrit l'adresse d'autrui garderait l'accès au compte.
- Pseudo ou titre contenant du balisage ou du code : affiché tel quel comme du
  texte, jamais interprété.
- Pseudo trop long : limité à 50 caractères, espaces de début et de fin retirés.
- Beaucoup de votants sur un même jour (plus de 20) : la liste au survol reste
  lisible (défilement ou résumé « et N autres »).
- Deux réponses validées au même instant : les deux sont comptées, aucune n'est
  perdue.
- Un vote arrive sur un jour pendant que le créateur le retire : le vote est
  conservé et le retrait refusé.
- Sondage dont les jours proposés s'étendent sur plusieurs mois : le calendrier
  s'ouvre sur le mois du premier jour proposé encore à venir, et signale les
  mois qui contiennent des jours proposés.
- Connexion perdue pendant la consultation : les pastilles se remettent à jour
  au retour de la connexion, sans action de l'utilisateur.
- Envoi massif de réponses depuis une même origine : limité pour éviter le
  bourrage d'un sondage.
- Compte supprimé par son titulaire : ses sondages et ses réponses sont
  supprimés.
- Service d'envoi d'emails indisponible : la réponse ou la clôture est
  enregistrée normalement ; l'email part au retour du service.
- Réponse retirée avant le départ de l'email regroupé : elle n'y figure pas.

## Requirements *(mandatory)*

### Functional Requirements

**Comptes et connexion**

- **FR-001**: Le système DOIT permettre de créer un compte local avec une
  adresse email, un nom d'affichage et un mot de passe.
- **FR-002**: Le système DOIT imposer des mots de passe d'au moins 10 caractères
  comprenant une minuscule, une majuscule, un chiffre et un caractère spécial.
- **FR-003**: Le système DOIT permettre de se connecter et de créer un compte
  avec une identité Google dont l'adresse email est vérifiée, et rattacher
  cette identité à un compte local existant de même adresse.
- **FR-004**: Le système DOIT permettre de réinitialiser un mot de passe oublié
  par un lien envoyé à l'adresse du compte.
- **FR-005**: Le système DOIT rendre des messages d'échec de connexion
  indifférenciés (ne jamais révéler si une adresse possède un compte) et
  ralentir les tentatives répétées.
- **FR-006**: Le système DOIT permettre à un utilisateur de supprimer son
  compte, ce qui supprime ses sondages et ses réponses.

**Création d'un sondage**

- **FR-007**: Seul un utilisateur connecté DOIT pouvoir créer un sondage.
- **FR-008**: Un sondage DOIT comporter un titre (obligatoire, 1 à 120
  caractères), une description facultative (jusqu'à 2 000 caractères) et au
  moins un jour proposé.
- **FR-009**: Le calendrier de création DOIT permettre de sélectionner des jours
  un par un, des plages par glissé, une colonne de jour de la semaine et une
  semaine entière, avec le même comportement que le calendrier de prise de
  rendez-vous du site laserit.fr (semaine commençant le lundi, numéros de
  semaine, grille de six rangées, navigation au clavier, passage rapide au mois
  et à l'année).
- **FR-010**: Le système DOIT interdire la sélection de jours passés à la
  création.
- **FR-011**: Un sondage ne DOIT pas proposer plus de 366 jours.
- **FR-012**: À la création, le système DOIT générer un lien de partage unique
  et impossible à deviner, et proposer de le copier en un geste.

**Réponse à un sondage**

- **FR-013**: Toute personne disposant du lien DOIT pouvoir consulter le
  sondage et, sauf si le créateur exige un compte (FR-040), y répondre sans
  compte.
- **FR-014**: Un répondant DOIT pouvoir soit se connecter (son nom d'affichage
  est alors utilisé), soit, si le sondage l'autorise, saisir un nom ou pseudo
  (obligatoire, 1 à 50 caractères après retrait des espaces de début et de
  fin).
- **FR-015**: Dans le calendrier de réponse, seuls les jours proposés par le
  créateur et non encore passés DOIVENT être sélectionnables ; les autres
  restent visibles mais inactifs.
- **FR-016**: Le système DOIT refuser, côté service, toute réponse contenant un
  jour non proposé ou passé, quelle que soit sa provenance.
- **FR-017**: Une réponse DOIT contenir au moins un jour.
- **FR-018**: Un utilisateur connecté ne DOIT avoir qu'une réponse par sondage ;
  un répondant sans compte n'en a qu'une par appareil et navigateur.
- **FR-019**: Après validation, le répondant DOIT pouvoir modifier ses jours
  ou retirer sa réponse : connecté, depuis son compte sur n'importe quel
  appareil ; sans compte, uniquement depuis l'appareil et le navigateur qui ont
  envoyé la réponse. Toute modification ou tout retrait est répercuté comme une
  nouvelle réponse (FR-023).

**Synthèse des votes**

- **FR-020**: Chaque jour ayant au moins un vote DOIT afficher une pastille
  indiquant le nombre de votes ; un jour sans vote n'en affiche pas.
- **FR-021**: Le survol d'un jour (ou le focus clavier, ou un geste tactile
  dédié) DOIT afficher la liste des noms des votants de ce jour.
- **FR-022**: La synthèse DOIT être visible par toute personne disposant du
  lien, qu'elle ait répondu ou non.
- **FR-023**: Toute réponse validée DOIT être répercutée sur tous les écrans
  ouverts sur le sondage sans rechargement de la page.

**Gestion des sondages**

- **FR-024**: Un utilisateur connecté DOIT pouvoir lister ses sondages avec
  leur titre, leur nombre de répondants, leur date de création, leur état
  (ouvert ou clos) et, le cas échéant, leur date retenue.
- **FR-025**: Seul le créateur DOIT pouvoir modifier le titre, la
  description et les jours proposés (FR-027) d'un sondage, le clore ou le
  rouvrir (FR-026), ou le supprimer (après confirmation).
- **FR-026**: Le créateur DOIT pouvoir clore et rouvrir son sondage. Un
  sondage clos reste consultable (pastilles, votants) mais n'accepte plus
  aucune nouvelle réponse, modification ni retrait. En clôturant, ou tant que
  le sondage est clos, le créateur PEUT désigner une date retenue parmi les
  jours proposés ; elle est mise en avant pour tous les porteurs du lien.
  Rouvrir le sondage retire la date retenue.
- **FR-027**: Le créateur DOIT pouvoir ajouter des jours proposés à tout
  moment, dans le respect de FR-010 et FR-011. Il NE DOIT pouvoir retirer
  qu'un jour ne portant aucun vote au moment du retrait ; un sondage garde
  toujours au moins un jour proposé. Aucun vote n'est jamais supprimé par une
  modification des jours.
- **FR-028**: Une action sur un sondage refusée pour défaut de droit DOIT
  répondre comme si le sondage n'existait pas.
- **FR-039**: Le créateur DOIT pouvoir supprimer n'importe quelle réponse de
  son sondage, après confirmation ; la suppression est répercutée sur tous les
  écrans ouverts (FR-023).
- **FR-040**: Le créateur DOIT pouvoir, à la création comme plus tard, exiger
  que les répondants soient connectés (désactivé par défaut). Activée, cette
  option refuse toute nouvelle réponse et toute modification sans compte ; les
  réponses sans compte déjà données restent affichées, leur auteur peut encore
  les retirer, et le créateur peut les supprimer.

**Notifications par email**

- **FR-041**: Le créateur DOIT recevoir un email signalant les nouvelles
  réponses à son sondage, regroupées : le premier email part 15 minutes après la
  première nouvelle réponse, puis au plus un email par sondage toutes les
  30 minutes, chacun listant les répondants arrivés depuis le précédent. Cette option
  du sondage est activée par défaut et désactivable par le créateur, depuis le
  sondage ou depuis un lien présent dans chaque email.
- **FR-042**: Quand le créateur désigne ou change la date retenue, chaque
  répondant connecté du sondage DOIT recevoir un email annonçant cette date,
  avec le lien du sondage. Les répondants sans compte ne reçoivent rien (le
  service ne connaît pas leur adresse).
- **FR-043**: Un échec d'envoi d'email NE DOIT ni bloquer ni annuler l'action
  qui l'a déclenché ; l'envoi est retenté.

**Apparence et page d'accueil**

- **FR-029**: Le service DOIT proposer deux thèmes, clair et sombre ; à la
  première visite le thème suit le réglage du système, puis le choix explicite
  du visiteur est retenu sur son appareil, sans connexion requise.
- **FR-030**: Le thème DOIT être appliqué dès le premier affichage, sans flash
  de l'autre thème.
- **FR-031**: L'identité visuelle (palette, typographie, style des composants)
  DOIT reprendre celle du site laserit.fr.
- **FR-032**: La page d'accueil DOIT présenter une démonstration animée d'un
  sondage de dates, le principe en trois étapes et un appel à créer un sondage
  visible sans défiler.
- **FR-033**: Toute animation DOIT respecter la préférence système « réduire
  les animations ».
- **FR-034**: Toutes les pages DOIVENT être utilisables sur téléphone, sans
  défilement horizontal, et entièrement au clavier.

**Exploitation et conformité**

- **FR-035**: Le service DOIT être servi uniquement en HTTPS à l'adresse
  dateplanner.laserit.fr.
- **FR-036**: Le service DOIT présenter des mentions légales et une politique
  de confidentialité décrivant les données collectées (email, nom, pseudo,
  votes) et leur durée de conservation.
- **FR-037**: Les pages de sondage ne DOIVENT pas être indexées par les moteurs
  de recherche.
- **FR-038**: Le système DOIT limiter les créations par origine : au plus
  5 créations de compte par heure et par adresse réseau, 20 sondages par heure
  et par compte, 30 réponses par heure et par adresse réseau (dont 10 sur un
  même sondage) ; au-delà, l'action est refusée avec le délai d'attente.

### Key Entities *(include if feature involves data)*

- **Utilisateur**: personne titulaire d'un compte. Adresse email (unique), nom
  d'affichage, mot de passe (absent si le compte ne passe que par Google),
  identité Google éventuelle, date de création.
- **Sondage**: titre, description facultative, créateur (un Utilisateur),
  identifiant public du lien de partage, date de création, état (ouvert ou
  clos), date retenue facultative (un des jours proposés, seulement quand le
  sondage est clos), exigence d'un compte pour répondre (oui ou non, non par
  défaut), notification du créateur par email (oui ou non, oui par défaut).
- **Jour proposé**: une date calendaire (sans heure) proposée par le créateur,
  rattachée à un Sondage. Un sondage en a au moins un.
- **Réponse**: la participation d'une personne à un Sondage. Rattachée soit à
  un Utilisateur, soit à un pseudo saisi ; une réponse sans compte est
  reconnue par l'appareil et le navigateur qui l'ont envoyée. Date de
  validation, date de dernière modification.
- **Vote**: le lien entre une Réponse et un Jour proposé qu'elle a retenu. Le
  nombre de votes d'un jour est le nombre de Réponses qui l'ont retenu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un nouveau visiteur crée son compte, crée un sondage de plusieurs
  jours et copie son lien en moins de 3 minutes.
- **SC-002**: Un répondant sans compte répond à un sondage en moins d'une minute
  après ouverture du lien.
- **SC-003**: Une réponse validée apparaît sur tous les écrans ouverts sur le
  sondage en moins de 5 secondes, sans action de leur part.
- **SC-004**: 100 % des réponses contenant un jour non proposé ou passé sont
  refusées, y compris celles envoyées hors de l'interface.
- **SC-005**: Un sondage de 60 jours proposés et 100 répondants s'affiche
  complet, pastilles comprises, en moins de 2 secondes sur une connexion 4G.
- **SC-006**: La page d'accueil affiche son contenu principal en moins de
  2,5 secondes sur un téléphone en 4G.
- **SC-007**: À la première visite, le thème affiché correspond au réglage du
  système dans 100 % des cas, sans flash de l'autre thème.
- **SC-008**: 9 testeurs sur 10 trouvent, sans aide, qui a voté pour un jour
  donné, sur ordinateur comme sur téléphone.
- **SC-009**: Tous les parcours (création, réponse, consultation) sont
  réalisables au clavier seul, et les textes respectent un contraste lisible
  dans les deux thèmes.

## Assumptions

- **Service autonome** : comptes, données et disponibilité sont indépendants du
  site laserit.fr ; un compte laserit.fr ne donne pas accès à DatePlanner et
  inversement. Le service est hébergé sur la même infrastructure que laserit.fr,
  sous son propre sous-domaine.
- **Inscription ouverte** : n'importe qui peut créer un compte. Chaque créateur
  modère son propre sondage (FR-039, FR-040) ; il n'y a pas d'administration
  du service ni de modération globale dans cette version.
- **Jours entiers** : un sondage porte sur des jours, sans heures ni créneaux ;
  « aujourd'hui » s'entend à l'heure de Paris.
- **Vote binaire** : un répondant coche les jours qui lui conviennent ; pas de
  réponse « peut-être » ni de préférence graduée.
- **Confidentialité par le lien** : quiconque a le lien voit le sondage et le
  nom des votants ; il n'y a pas de sondage protégé par mot de passe.
- **Compte utilisable immédiatement** : l'adresse email sert à la connexion et à
  la réinitialisation du mot de passe ; aucune confirmation préalable n'est
  exigée pour créer un sondage.
- **Notifications limitées aux emails** : seuls les emails de FR-041 et FR-042
  sont envoyés ; pas de notification du navigateur ni de rappel automatique aux
  invités qui n'ont pas répondu.
- **Langue** : interface en français uniquement.
- **Conservation** : un sondage est supprimé automatiquement 12 mois après son
  dernier jour proposé ; un compte sans activité depuis 3 ans est supprimé après
  avertissement par email.
- **Cookies** : seuls des cookies strictement nécessaires sont utilisés — la
  session, la reconnaissance de l'appareil d'un répondant sans compte et
  l'aller-retour de la connexion Google ; le choix du thème est gardé dans le
  navigateur, hors cookie. Pas de mesure d'audience tierce, donc pas de bandeau
  de consentement.
- **Référence visuelle et fonctionnelle** : le calendrier et l'identité visuelle
  du site laserit.fr servent de modèle ; ils sont repris dans ce service, sans
  dépendance à ce site.
- **Constitution** : la constitution du projet n'est pas encore rédigée ; cette
  spécification ne s'appuie sur aucun principe de projet préalable.
