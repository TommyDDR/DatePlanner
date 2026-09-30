# Contrat — pages

Ce que chaque adresse montre, à qui, et ce qu'elle refuse. Les mutations déclenchées depuis
ces pages sont décrites dans [server-actions.md](server-actions.md).

Règles communes : HTTPS seul ; thème posé avant la première peinture ; en-tête avec marque,
bascule de thème et accès au compte ; pied de page vers les pages légales. « Introuvable » =
page 404 ordinaire, identique qu'un objet n'existe pas ou soit refusé.

| Adresse | Accès | Indexée | Contenu | FR |
|---|---|---|---|---|
| `/` | tous | oui | démonstration animée, trois étapes, appel « Créer un sondage » (vers `/nouveau`, ou `/connexion?suite=/nouveau` sans session) | FR-032–034 |
| `/connexion` | sans session (sinon redirigé vers `suite` ou `/mes-sondages`) | non | email + mot de passe, bouton Google, liens inscription et mot de passe oublié ; paramètre `suite` analysé par `safeInternalPath` | FR-003, FR-005 |
| `/inscription` | sans session | non | email, nom d'affichage, mot de passe (règle affichée sous le champ), bouton Google | FR-001–003 |
| `/mot-de-passe-oublie` | tous | non | email ; réponse toujours identique | FR-004 |
| `/reinitialisation?jeton=…` | tous | non | nouveau mot de passe ; jeton invalide ou expiré : message neutre et lien vers `/mot-de-passe-oublie` | FR-004 |
| `/nouveau` | session requise, sinon `/connexion?suite=/nouveau` | non | titre, description, calendrier de création, options « répondants connectés uniquement » et « me prévenir des nouvelles réponses » ; à la réussite : lien de partage et bouton Copier | FR-007–012, FR-040, FR-041 |
| `/mes-sondages` | session requise | non | liste des sondages du compte, plus récents d'abord : titre, nombre de répondants, date de création, état, date retenue ; lien vers chacun | FR-024 |
| `/s/{publicId}` | quiconque a le lien | non | voir ci-dessous | FR-013–023, FR-025–028, FR-039–041 |
| `/compte` | session requise | non | nom d'affichage, adresse, méthode de connexion, déconnexion, suppression du compte | FR-006 |
| `/notifications/resume/desactiver?t=…` | tous (lien signé) | non | confirmation de la désactivation du résumé pour ce sondage ; jeton invalide : message neutre | FR-041 |
| `/mentions-legales` | tous | oui | éditeur et hébergeur | FR-036 |
| `/confidentialite` | tous | oui | données, finalités, durées, cookies, droits | FR-036 |

## `/s/{publicId}` en détail

**Pour tous** : titre, description, état (bandeau « Sondage clos » et date retenue en jade si
clos), calendrier avec pastilles de votes, infobulle des votants au survol et au focus, liste
« Qui est disponible ? » sous le calendrier (jour, nombre, noms ; réponse connectée marquée).
Abonnement au flux en direct (voir [http-api.md](http-api.md)).

**Formulaire de réponse** (sondage ouvert seulement) :

| Situation | Affiché |
|---|---|
| Connecté, pas encore répondu sous son compte | calendrier sélectionnable (jours proposés à venir), bouton Valider ; nom du compte rappelé. Une réponse anonyme de cet appareil est ignorée : ni affichée dans le formulaire, ni modifiable tant qu'on est connecté (elle reste dans la synthèse) |
| Connecté, déjà répondu | ses jours pré-cochés, boutons Mettre à jour et Retirer ma réponse |
| Sans session, sondage sans compte exigé, pas de réponse sur cet appareil | champ pseudo, calendrier, bouton Valider, lien « Se connecter pour répondre » |
| Sans session, réponse existante sur cet appareil (y compris après une déconnexion) | pseudo et jours pré-remplis, Mettre à jour, Retirer |
| Sans session, compte exigé | invitation à se connecter (`/connexion?suite=/s/{publicId}`), aucun champ pseudo ; une réponse existante sur cet appareil reste retirable |
| Sondage clos | aucun formulaire ; calendrier en consultation |

**Panneau du créateur** (session du propriétaire seulement, jamais rendu aux autres) :
modifier titre et description ; ajouter des jours ; retirer un jour sans vote (un jour voté
n'offre pas le retrait) ; options compte exigé et résumé par email ; clore avec ou sans date
retenue, changer la date retenue, rouvrir ; supprimer une réponse (confirmation) ; supprimer le
sondage (confirmation) ; copier le lien.

**Refus** : `publicId` mal formé, inconnu ou supprimé ⇒ introuvable.
