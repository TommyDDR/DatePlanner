# Administration

_Source : évolution après la version 0.6.0._

## Décision

Un compte administrateur se déclare par son adresse dans `.env`, `ADMIN_EMAILS` (plusieurs adresses séparées par des virgules), jamais dans le dépôt, qui est public. Il n'est administrateur qu'une fois son adresse **prouvée** : connexion Google, ou lien de réinitialisation du mot de passe utilisé. La variable n'est pas gravée au build : la changer demande un redémarrage, pas un nouveau build.

L'administrateur a un menu « Administration » dans l'en-tête - dans le menu à trois traits sur téléphone -, vers deux écrans :

- **Utilisateurs** (`/admin/utilisateurs`) : les comptes, les plus récents d'abord, par pages de 20, cherchés par nom ou adresse ; pour chacun, adresse, méthodes de connexion, adresse prouvée ou non, dates de création et de dernière activité, nombre de sondages (lien vers ses sondages) et de réponses. Un compte se supprime après confirmation, avec ses sondages, leurs réponses et les réponses qu'il a données ailleurs, comme une suppression par son titulaire. Ses emails en attente sont annulés, les pages ouvertes de ses sondages disent « introuvable », celles des sondages où il avait répondu se relisent. Ni son propre compte (il se supprime depuis « Mon compte ») ni celui d'un autre administrateur ne se suppriment d'ici. Le journal du service garde qui a supprimé quel compte, par identifiants seulement.
- **Tous les sondages** (`/admin/sondages`) : par pages de 20, triés par date de création, de clôture (les sondages ouverts après les clos), dernière activité, titre ou nombre de répondants, dans un sens ou l'autre ; filtrés par état (en cours, clos), par période - de création, de clôture ou de jours proposés, bornes comprises, en jours de Paris - et par recherche sur le titre, le nom ou l'adresse du créateur. Tri, filtres et page voyagent dans l'adresse : un formulaire `GET`, sans JavaScript.

Pour tout autre visiteur, connecté ou non, ces adresses n'existent pas : page « introuvable » ordinaire, et aucune action n'aboutit. Le contrôle se fait dans chaque page et chaque action, et les fonctions de `src/server/admin/` exigent un `AdminUser` que seule `getAdminUser` rend ; pas dans une mise en page commune, que Next ne rejoue pas d'une page à l'autre.

## Pourquoi

L'inscription est ouverte : il faut pouvoir retirer un compte qui abuse du service, et voir ce qui s'y crée. Un rôle en base demanderait une migration et un moyen de le donner ; une adresse dans `.env` suffit pour un service à un seul éditeur, et reste hors du dépôt public. L'inscription ne vérifie pas l'adresse (décision 004) : sans la preuve, s'inscrire le premier avec l'adresse de l'administrateur suffirait à l'être ; la connexion Google du vrai titulaire reprend ensuite ce compte (FR-003). La politique de confidentialité dit désormais que l'éditeur voit les adresses des comptes.
