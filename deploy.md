# Déployer DatePlanner en production

Marche à suivre pour publier une version et la mettre en ligne. La première
installation du serveur (conteneur, base, unités systemd, DNS, Traefik) est décrite
dans `README.md` § 6 ; ce fichier ne couvre que la MISE À JOUR.

---

## 1. Principe

La production sert un **tag** (`v0.1.0`, `v0.1.1`…), jamais `main`. On sait
ainsi exactement ce qui tourne, et revenir à la version précédente est un
geste nommé. **Un tag publié ne se déplace pas** : une correction fait une
nouvelle version.

Aucun déploiement n'est automatique : rien ne part sur le serveur sans qu'on
l'ait lancé depuis un poste de développement, et aucune fusion sur `main` ne
déploie quoi que ce soit.

| Machine | Adresse | Accès | Rôle |
|---|---|---|---|
| Hôte Proxmox | `192.168.1.10` | `ssh root@…` | snapshots des conteneurs |
| CT 201 `proxy` | `192.168.1.51` | `ssh admin@…` | HTTPS : **non touché** par un déploiement |
| CT 202 `dateplanner` | `192.168.1.53` | `ssh admin@…` | code dans `/opt/dateplanner`, service `dateplanner`, compte `dateplanner` |

---

## 2. Publier une version

### En une commande

Depuis la racine du dépôt, sur le réseau local, `gh` authentifié, copie de
travail propre :

```bash
npm run release
```

Tout y est : PR de version, contrôles, fusion, tag, release GitHub,
snapshot, mise à jour du conteneur, vérification. Le script
(`scripts/release.sh`) déroule les §§ 2.1 à 3.3 ci-dessous ; ce qui suit dit
ce qu'il décide à la place de celui qui le lance.

- **Le numéro** est déduit des commits fusionnés depuis le dernier tag :
  un `feat(…)` fait une version mineure (0.7.1 vers 0.8.0), sinon c'est un
  correctif (0.7.1 vers 0.7.2). Une rupture (`feat!:`,
  `BREAKING CHANGE`) fait une majeure à partir de 1.0.0. Pour l'imposer :
  `npm run release -- minor`, `-- patch`, `-- major` ou `-- 0.8.0`.
- **Les contrôles** (§ 2.2) sont ceux de l'intégration continue : le script
  attend ses deux passages sur le commit de version, la poussée et la pull
  request, et s'arrête si l'un n'est pas vert. Si le workflow est désactivé
  sur GitHub, il les rejoue en local, et retient le commit contrôlé
  (`.git/release-controls`) : relancé, il ne les rejoue pas sur un commit
  qui les a déjà passés.
- **Ce qui est fusionné est ce qui a été contrôlé.** Si `main` bouge pendant
  les contrôles, la branche de version est refaite sur le nouveau `main` et
  contrôlée de nouveau ; la fusion exige le commit contrôlé
  (`--match-head-commit`).
- **Il reprend là où il s'est arrêté.** Chaque étape regarde l'état avant
  d'agir : une PR de version ouverte est reprise, une PR fusionnée est
  taguée, un tag publié est déployé, une version en ligne est seulement
  vérifiée. Après un échec, le script affiche la commande qui reprend
  (`npm run release -- 0.8.0`) ; sans argument, il reprend aussi une version
  fusionnée mais pas taguée, ou taguée mais pas en ligne, plutôt que d'en
  ouvrir une nouvelle.
- **Il change de branche** dans la copie de travail et finit sur `main`, à
  jour. Un fichier suivi modifié l'arrête avant tout geste.

Variantes :

```bash
npm run release -- --preparer      # PR de version ouverte et contrôlée, puis arrêt
npm run deploy -- v0.8.0           # déploie une version déjà publiée (§ 3)
npm run deploy -- --essai v0.8.0   # dit ce qu'il ferait, sans rien toucher
```

`--preparer` laisse la PR à relire ; `npm run release -- 0.8.0` la reprend
ensuite. `npm run deploy` reprend un déploiement interrompu, ou revient à une
version antérieure sans migration entre les deux (§ 5).

`npm run` passe par cmd.exe sous Windows, où `bash` est souvent celui de WSL :
une autre machine, sans les clés SSH ni l'authentification de `gh`.
`scripts/lib/run-bash.mjs` lance donc le bash de Git (`GIT_BASH` en désigne
un autre). Depuis Git Bash, les scripts se lancent aussi directement.

Les sections qui suivent font la même chose à la main. Depuis un poste de
développement, avec `gh` authentifié. Exemple pour 0.1.1.

### 2.1 Pull request de version

La version de `package.json` suit le tag. Rien ne se pousse sur `main` : elle
passe par une pull request.

```bash
git switch main && git pull --ff-only
git switch -c chore/release-0.1.1
npm version 0.1.1 --no-git-tag-version   # package.json et package-lock.json
git commit -am "chore(release): 0.1.1"
git push -u origin chore/release-0.1.1
gh pr create --fill
```

### 2.2 Contrôles

`gh pr checks --watch` : tout doit être vert. Sans intégration continue, les
rejouer en local (`specs/001-date-poll/quickstart.md` § 3) :

```bash
npm audit --omit=dev
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
npm run e2e:perf
```

### 2.3 Fusion, tag, release

```bash
gh pr merge --merge --delete-branch

git switch main && git pull --ff-only
git tag -a v0.1.1 -m "Version 0.1.1"     # sur le commit de fusion
git push origin v0.1.1
gh release create v0.1.1 --verify-tag --generate-notes
```

---

## 3. Déployer une version

Ce que fait `npm run deploy -- v0.1.1` (`scripts/deploy.sh`), appelé en
dernier par `npm run release`. Il saute le snapshot s'il existe déjà, ou pour
revenir à une version antérieure ; il signale les fichiers de `deploy/`
modifiés depuis la version en ligne, qui restent à réinstaller à la main.

### 3.1 Snapshot du conteneur

Toujours AVANT de toucher au serveur : c'est le retour arrière si la version
casse quelque chose. Il couvre le code et la base.

```bash
ssh root@192.168.1.10 dateplanner-snapshot v0.1.1
```

Le script (`deploy/dateplanner-snapshot.sh`, installé sur l'hôte par
`README.md` § 6.6) prend le snapshot `avant_v0_1_1` - Proxmox refuse le point
dans un nom -, puis supprime les snapshots `avant_*` plus anciens que les deux
derniers : restent celui-ci et celui du déploiement précédent.

En reprenant un déploiement raté, ne pas le relancer : le snapshot existe déjà
et tient l'état d'avant la première tentative. Le script refuse d'ailleurs un
nom déjà pris.

### 3.2 Mise à jour du code

Dans le conteneur, toutes les commandes sous le compte du service :

```bash
ssh admin@192.168.1.53
cd /opt/dateplanner
sudo -u dateplanner -H git fetch --tags origin
sudo -u dateplanner -H git checkout --detach v0.1.1
sudo -u dateplanner -H npm ci
sudo -u dateplanner -H npm run build
sudo -u dateplanner -H npx prisma migrate deploy
sudo systemctl restart dateplanner
```

- **Le build passe AVANT les migrations.** Il ne lit pas la base - toutes
  les pages sont rendues à la requête - : s'il échoue, la base est encore
  celle de la version en ligne, et revenir à l'ancien tag suffit (§ 5, sans
  migration). `npm run deploy` le fait seul : il remet le code d'avant, le
  reconstruit, redémarre et s'arrête en échec.
- **Si `npm run build` échoue, ne pas redémarrer sur la nouvelle version.**
  Le service tourne encore sur l'ancienne, chargée en mémoire, mais le
  dossier `.next` est à moitié réécrit : reconstruire l'ancien tag puis
  redémarrer.
- `npm ci` et `migrate deploy` ne font rien si les dépendances ou le schéma
  n'ont pas changé : les lancer à chaque fois évite d'en oublier un.
- Le dépôt du serveur est en « HEAD détachée » : c'est voulu, il est posé sur
  une version et non sur une branche.
- Un fichier de `deploy/` modifié par la version se réinstalle à la main
  (commandes de `README.md` § 6.3), puis `sudo systemctl daemon-reload`.

### 3.3 Vérification

```bash
sudo -u dateplanner -H git describe --tags          # v0.1.1
systemctl is-active dateplanner                     # active
sudo journalctl -u dateplanner -n 50 --no-pager     # « Ready », aucune erreur
curl -s -o /dev/null -w "%{http_code}\n" https://dateplanner.fr/api/sante   # 200
curl -s https://dateplanner.fr/api/sante    # ni "maintenance":"late", ni "backup":"late"
```

Puis, dans un navigateur : l'accueil, un sondage ouvert dans deux fenêtres (un
vote de l'une apparaît dans l'autre en moins de cinq secondes), la connexion
avec Google. Après une première mise en service, dérouler toutes les
vérifications de `specs/001-date-poll/quickstart.md` § 5.

### 3.4 Suppression des snapshots

Rien à faire : le déploiement suivant supprime les snapshots au-delà des deux
derniers (§ 3.1). Un snapshot grossit à chaque écriture sur le disque ; deux
suffisent à revenir sur la version d'avant, ou sur celle d'encore avant.

```bash
ssh root@192.168.1.10 pct listsnapshot 202
```

---

## 4. Changer seulement la configuration

Une valeur modifiée dans `/opt/dateplanner/.env` ne demande pas de nouvelle
version :

- variable ordinaire : `sudo systemctl restart dateplanner` suffit ;
- clé publique `NEXT_PUBLIC_…` : elle est écrite dans les pages au build, il
  faut donc `sudo -u dateplanner -H npm run build` puis le redémarrage ;
- `CRON_SECRET` : la maintenance lit le même fichier, rien d'autre à changer.

---

## 5. Revenir en arrière

**Sans migration entre les deux versions** : déployer l'ancien tag.

```bash
cd /opt/dateplanner
sudo -u dateplanner -H git checkout --detach v0.1.0
sudo -u dateplanner -H npm ci
sudo -u dateplanner -H npm run build
sudo systemctl restart dateplanner
```

**Avec une migration** : `migrate deploy` ne défait rien, et l'ancien code sur
le nouveau schéma peut casser. Restaurer le snapshot, depuis l'hôte :

```bash
ssh root@192.168.1.10
pct rollback 202 avant_v0_1_1
pct start 202
```

Le code et la base reviennent à l'instant du snapshot. **Tout ce qui a été
écrit depuis est perdu** : comptes, sondages, réponses. À réserver au cas où
la version ne peut pas rester en ligne.

---

## 6. Dépannage

**Le service ne démarre pas.** Lire le journal :
`sudo journalctl -u dateplanner -n 100 --no-pager`. Après cinq démarrages
ratés en une minute, systemd abandonne ; une fois la cause corrigée :

```bash
sudo systemctl reset-failed dateplanner
sudo systemctl restart dateplanner
```

**`/api/sante` signale la maintenance en retard.** Vérifier le minuteur et le
dernier passage :

```bash
systemctl list-timers dateplanner-maintenance.timer
sudo journalctl -u dateplanner-maintenance -n 20 --no-pager
```

Un `401` dans ce journal : `CRON_SECRET` vide ou changé sans redémarrer le
service web.

**`/api/sante` signale la sauvegarde en retard.** Aucune sauvegarde n'a abouti
depuis vingt-six heures. Lire le journal du timer, puis relancer à la main :

```bash
systemctl list-timers dateplanner-backup.timer
sudo journalctl -u dateplanner-backup -n 20 --no-pager
sudo systemctl start dateplanner-backup.service
```

Juste après une première installation, c'est normal : rien n'a encore été
consigné, la relance le fait.

**Les emails ne partent pas.** Chaque envoi raté garde son erreur dans la
file, trente jours :

```bash
sudo -u postgres psql dateplanner -c "SELECT template, status, attempts, last_error FROM email_outbox WHERE status <> 'SENT' ORDER BY created_at DESC LIMIT 10;"
```

Gmail n'accepte qu'un mot de passe d'application (`README.md` § 4).

**`git checkout` refuse de changer de version** (« Your local changes would be
overwritten »). Un fichier suivi a été modifié sur le serveur :
`sudo -u dateplanner -H git status` le nomme. Le serveur ne doit porter
aucune modification ; `.env` n'est pas suivi et n'est pas concerné.
