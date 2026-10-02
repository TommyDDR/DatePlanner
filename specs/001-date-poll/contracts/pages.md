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
| `/mes-sondages` | session requise | non | deux listes, un lien vers chaque sondage : « Créés par moi », plus récents d'abord (titre, nombre de répondants, date de création, état, date retenue), puis « Auxquels j'ai répondu », sondages d'autres comptes où le compte a répondu, sa réponse la plus récente d'abord (mêmes informations et nom du créateur) ; bordure orangée à gauche (et « du nouveau » pour les lecteurs d'écran) sur un sondage changé depuis la dernière visite, tenue à jour en direct par `/api/mes-sondages/flux` et au retour sur l'onglet | FR-024, FR-044 |
| `/s/{publicId}` | quiconque a le lien | non | voir ci-dessous | FR-013–023, FR-025–028, FR-039–041, FR-044 |
| `/compte` | session requise | non | nom d'affichage, adresse, méthode de connexion, déconnexion, suppression du compte | FR-006 |
| `/notifications/resume/desactiver?t=…` | tous (lien signé) | non | confirmation de la désactivation du résumé pour ce sondage ; jeton invalide : message neutre | FR-041 |
| `/mentions-legales` | tous | oui | éditeur et hébergeur | FR-036 |
| `/confidentialite` | tous | oui | données, finalités, durées, cookies, droits | FR-036 |

## `/s/{publicId}` en détail

**Pour tous** : titre, description, état (bandeau « Sondage clos » et date retenue en jade si
clos), calendrier avec pastilles de votes, dorées pour les jours les plus votés, infobulle des
votants au survol et au focus, liste « Qui est disponible ? » sous le calendrier (jour, nombre,
noms ; réponse connectée marquée), du plus voté au moins voté, le plus proche d'abord à égalité.
Abonnement au flux en direct (voir [http-api.md](http-api.md)). Pour le créateur ou un
répondant connecté, la page dit au serveur quelle version elle affiche (`markPollSeen`), à
chaque rendu qui en montre une nouvelle : la bordure « du nouveau » disparaît de « Mes sondages »
(FR-044).

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
modifier titre et description ; changer les jours sur le seul calendrier - jour sans vote
orangé et retirable, jour voté gris et figé, jour libre ajouté d'un clic, le tout enregistré
d'un envoi ; un retrait devancé par un vote tombe, avec un avertissement (décision 031) ; options compte exigé et résumé par email ; clore avec ou sans date
retenue, changer la date retenue - choisie sur un calendrier parmi les seuls jours proposés,
pastilles de votes en vue, les trois plus votés aussi d'une touche (décision 038) -, rouvrir ; supprimer une réponse (confirmation) ; supprimer le
sondage (confirmation) ; copier le lien.

**Refus** : `publicId` mal formé, inconnu ou supprimé ⇒ introuvable.
