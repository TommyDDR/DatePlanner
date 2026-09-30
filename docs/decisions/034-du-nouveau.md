# « Mes sondages » : répondus et « du nouveau »

_Source : évolution après la version 0.3.0 (FR-024, FR-044)._

## Décision

« Mes sondages » montre deux listes : les sondages créés, puis ceux d'autres comptes auxquels on a répondu avec son compte. Une réponse sans compte appartient à un appareil, pas au compte : elle n'y figure pas.

Un sondage qui a changé depuis la dernière visite porte une bordure orangée à gauche, l'incandescent des actions, élargie à 4 px ; les lecteurs d'écran entendent « du nouveau » après son titre. La bordure prend sur le retrait : le texte reste aligné d'une ligne à l'autre. Chaque sondage a une version, `activity_at`, qui avance à chaque changement visible d'un participant : réponse donnée, modifiée, retirée ou supprimée, titre, description, jours, état, date retenue. Les options (compte exigé, résumés) n'en sont pas : elles ne changent rien pour qui a déjà répondu. Le créateur garde la dernière version vue dans `poll.owner_seen_at`, un répondant connecté dans `response.seen_at`. Vue plus ancienne que la version courante : du nouveau.

La version vue avance de deux façons :

- l'auteur connecté d'un changement le voit par définition : l'action qui l'enregistre avance aussi sa version vue ;
- la page du sondage dit au serveur, par une action, quelle version elle affiche, à chaque rendu qui en montre une nouvelle, mise à jour en direct comprise. Le serveur ne l'accepte que du créateur ou d'un répondant connecté, ne la fait jamais reculer, ni passer la version courante. Si elle a avancé, « Mes sondages » est relue : le retour en arrière n'y montre pas une bordure déjà lue.

« Mes sondages » se tient à jour sans recharger. Un flux en direct par compte, `/api/mes-sondages/flux`, s'abonne au bus de chaque sondage de la page (décision 008) et annonce « l'un d'eux a changé », sans dire lequel : la page se relit, la bordure apparaît. La liste suivie est lue à l'ouverture du flux, que la page rouvre quand sa liste change. Ce qui ne passe pas par le bus - un sondage lu dans un autre onglet - s'efface quand on revient sur l'onglet, qui se relit alors.

La version avance après la transaction du changement, sous le verrou de la ligne, d'au moins une milliseconde. Une page lue avant un changement porte donc une version plus ancienne que celle qui l'annonce : rien n'est manqué, et au pire un changement déjà vu est signalé une fois. Comme la publication en direct, cette écriture ne fait jamais échouer le changement.

## Pourquoi

Une bordure plutôt qu'une pastille : elle signale la ligne entière sans ajouter un libellé à côté de l'état et de la date retenue, et se repère d'un coup d'œil en parcourant la liste.

Une version plutôt qu'une heure de visite : c'est ce que la page a montré qui compte, pas le moment où on l'a ouverte, et la base ne garde rien de plus que ce qu'il faut pour comparer. Pas de table de visites : la version vue vit sur la ligne du créateur ou de la réponse, disparaît avec elle, et ouvrir le lien d'un sondage auquel on n'a pas répondu ne laisse aucune trace.

Un flux par compte plutôt qu'un flux par sondage listé : un navigateur ne tient que six connexions ouvertes vers un même site, et une page de vingt sondages les épuiserait. Il compte dans la même limite par adresse que les flux des sondages.

Marquer « vu » par une action du navigateur, et non pendant le rendu : une page préchargée n'a été vue par personne. La version affichée est celle que la page a rendue, pas la version courante au moment de l'action : un changement arrivé entre les deux reste du nouveau.
