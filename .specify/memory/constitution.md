# DatePlanner Constitution

## Core Principles

### I. Sécurité par construction (NON NÉGOCIABLE)

- Le contrôle d'accès DOIT être porté par la requête de données elle-même (filtre sur le
  propriétaire, le sondage, la réponse), jamais par une condition d'affichage.
- Une ressource inaccessible DOIT répondre « introuvable », jamais « interdit » : on ne
  confirme pas l'existence de ce qu'on refuse.
- Toute valeur saisie par un utilisateur (titre, description, pseudo, nom) DOIT être échappée
  au point de sortie (page, email), jamais interprétée ; la base garde la saisie telle quelle.
- En production, le service DOIT être servi uniquement en HTTPS, avec cookies de session
  `Secure` et `HttpOnly`, et une politique de sécurité du contenu sans `'unsafe-inline'` pour
  les scripts.
- Les échecs de connexion DOIVENT être indifférenciés ; les tentatives répétées DOIVENT être
  freinées (verrou progressif, limitation par adresse et par compte).
- Une identité Google NE DOIT rattacher un compte que sur une adresse vérifiée par Google, et
  un compte DOIT ensuite être reconnu par l'identifiant Google, pas par l'adresse.
- Aucun secret (clé, mot de passe, jeton) NE DOIT être versionné.

Pourquoi : le service est public, sans compte obligatoire pour répondre ; chaque sondage est
une cible de bourrage et chaque champ libre un vecteur d'injection. Une règle de sécurité qui
dépend de l'affichage finit toujours par être contournée.

### II. Le serveur décide

- Toute règle appliquée dans l'interface (jours non proposés ou passés, sondage clos, compte
  exigé, retrait d'un jour voté) DOIT être revérifiée par le serveur, qui seul fait foi.
  L'interface masque ; le serveur refuse.
- Les écritures concurrentes DOIVENT être gardées par des conditions dans l'écriture elle-même
  (pas de lecture puis écriture non protégée) : aucune réponse perdue, aucun retrait de jour
  qui effacerait un vote arrivé entre-temps.
- Les mises à jour en direct NE DOIVENT transporter que des données que le destinataire a déjà
  le droit de lire.

Pourquoi : une requête fabriquée à la main ignore l'interface. SC-004 de la spec exige 100 %
de refus des votes illégitimes, ce qui n'est tenable que côté serveur.

### III. Logique pure, testée à chaque exigence

- Les règles de décision (calendrier, sélection de plages, comptage des votes, états du
  sondage, regroupement des notifications, conservation) DOIVENT vivre dans des modules purs,
  sans accès réseau, base ou navigateur, testables en isolation.
- Chaque exigence fonctionnelle (FR-xxx) et chaque invariant de sécurité DOIVENT être couverts
  par au moins un test automatisé. Un test qui tombe signale une régression, pas un test
  fragile.
- L'accès aux données DOIT être testé contre le même moteur de base qu'en production, jamais
  contre une imitation.
- Les parcours critiques (créer, répondre, voir la mise à jour en direct, clore) DOIVENT être
  couverts par des tests de bout en bout dans un vrai navigateur.

Pourquoi : c'est ce qui a permis à laserit.fr d'évoluer sans casser ; une logique enfouie dans
un composant ou une route ne se teste qu'en entier, donc mal.

### IV. Données personnelles minimales

- Le service NE DOIT collecter que ce que la spec exige (email, nom d'affichage, pseudo,
  votes) ; aucun traceur ni mesure d'audience tierce, seulement des cookies strictement
  nécessaires.
- Chaque donnée personnelle DOIT avoir une durée de conservation déclarée, appliquée
  automatiquement et annoncée dans la politique de confidentialité.
- La suppression d'un compte DOIT emporter ses sondages et ses réponses.

Pourquoi : RGPD, et un service hébergé chez soi rend l'exploitant responsable de bout en bout.

### V. Accessible, cohérent, en français

- Tout parcours DOIT être réalisable au clavier seul, avec un contraste lisible dans les deux
  thèmes, sur téléphone sans défilement horizontal.
- Toute animation DOIT respecter la préférence « réduire les animations ».
- Le thème DOIT être appliqué avant le premier affichage ; l'identité visuelle DOIT rester
  alignée sur celle de laserit.fr.
- L'interface, la documentation et les commentaires du code DOIVENT être en français ; les
  identifiants du code restent en anglais.

Pourquoi : les répondants arrivent par un lien, sur n'importe quel appareil ; un parcours qui
exclut une partie d'entre eux fausse le sondage.

### VI. Sobriété et dépendances maîtrisées

- Les dépendances DOIVENT être déclarées en version exacte, verrouillées, et l'audit des
  dépendances de production DOIT rapporter 0 faille connue ; une faille transitive se corrige
  par forçage de version, jamais en abaissant le seuil.
- Toute nouvelle dépendance ou brique d'infrastructure DOIT être justifiée dans le plan ; les
  briques déjà éprouvées sur laserit.fr DOIVENT être préférées, et tout écart justifié.
- Aucune fonctionnalité hors de la spec NE DOIT être construite « au cas où ».

Pourquoi : chaque dépendance est une surface d'attaque et une mise à jour à suivre, pour un
service maintenu par une seule personne.

## Contraintes d'exploitation

- **Autonomie** : DatePlanner DOIT avoir sa propre base, ses propres comptes et son propre
  cycle de déploiement ; il NE DOIT dépendre d'aucun composant de laserit.fr à l'exécution.
- **Hébergement** : auto-hébergé sur l'infrastructure existante (hôte Proxmox), dans une VM
  dédiée, derrière la VM proxy (Traefik + CrowdSec) qui termine le HTTPS et pose les en-têtes
  d'origine ; le service NE DOIT faire confiance qu'aux en-têtes posés par ce proxy.
- **Adresse** : `https://dateplanner.laserit.fr` uniquement ; toute requête reçue en clair
  DOIT être redirigée vers cette adresse.
- **Déploiement** : la production DOIT servir une version étiquetée (tag), jamais une branche ;
  un snapshot de la VM DOIT précéder chaque déploiement.
- **Surveillance** : un point de santé DOIT vérifier le processus ET la base, et être
  interrogé depuis l'extérieur.
- **Sauvegardes** : base sauvegardée chaque nuit, copiée hors de la machine ; la restauration
  DOIT avoir été éprouvée une fois.
- **Emails** : envoyés par le SMTP d'un fournisseur, jamais depuis la machine ; un échec
  d'envoi NE DOIT pas bloquer l'action qui l'a déclenché.
- **Journaux** : bornés en taille et en durée.

## Flux de travail et contrôles qualité

- Chaque user story, correction ou évolution DOIT être faite sur une branche dédiée
  (`feat/…`, `fix/…`, `chore/…`, `docs/…`), créée avant la première modification, et livrée
  par pull request vers `main`. Rien NE DOIT être poussé directement sur `main`.
- Une fonctionnalité DOIT suivre le cycle Spec Kit : spécification, clarification, plan,
  tâches, implémentation ; le dossier `specs/NNN-…/` est versionné avec le code.
- Aucune fusion sans contrôles verts, en intégration continue sur chaque poussée et chaque pull
  request : audit des dépendances de production, vérification des types, lint (0 erreur,
  0 avertissement), tests, build (0 avertissement), tests de bout en bout.
- Chaque décision produit ou technique tranchée DOIT être consignée dans
  `docs/decisions/NNN-titre.md` (sections « Décision » et « Pourquoi ») ; une décision
  consignée ne se rouvre pas sans raison nouvelle.
- `PROJET.md` DOIT décrire l'état du projet, la carte du code et les invariants à ne pas
  casser, et être tenu à jour à chaque livraison.

## Governance

- Cette constitution prime sur toute autre pratique du projet. Chaque `plan.md` DOIT passer
  la vérification de conformité (« Constitution Check ») avant la phase de recherche, puis
  après la conception ; tout écart DOIT être justifié dans la section de suivi de complexité
  du plan, faute de quoi il est refusé.
- Chaque pull request DOIT être relue au regard de ces principes ; `/speckit-analyze` traite
  toute violation comme critique.
- Un amendement passe par une pull request dédiée (`docs/…`) qui décrit le changement, son
  impact sur les specs et plans en cours, et incrémente la version :
  MAJEURE pour un principe retiré ou redéfini de façon incompatible, MINEURE pour un principe
  ou une section ajoutés ou nettement étendus, CORRECTIVE pour une clarification de forme.
- Les consignes de développement au quotidien vivent dans `PROJET.md`.

**Version**: 1.0.0 | **Ratified**: 2026-09-30 | **Last Amended**: 2026-09-30
