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

Aucun déploiement n'est automatique : rien ne part sur le serveur tant qu'on
ne l'y a pas mis à la main.

| Machine | Adresse | Accès | Rôle |
|---|---|---|---|
| Hôte Proxmox | `192.168.1.10` | `ssh root@…` | snapshots des conteneurs |
| CT 201 `proxy` | `192.168.1.51` | `ssh admin@…` | HTTPS : **non touché** par un déploiement |
| CT 202 `dateplanner` | `192.168.1.53` | `ssh admin@…` | code dans `/opt/dateplanner`, service `dateplanner`, compte `dateplanner` |

---

## 2. Publier une version

Depuis un poste de développement, avec `gh` authentifié. Exemple pour 0.1.1.

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
sudo -u dateplanner -H npx prisma migrate deploy
sudo -u dateplanner -H npm run build
sudo systemctl restart dateplanner
```

- `npm ci` et `migrate deploy` ne font rien si les dépendances ou le schéma
  n'ont pas changé : les lancer à chaque fois évite d'en oublier un.
- **Si `npm run build` échoue, ne pas redémarrer.** Le service tourne encore
  sur l'ancienne version, chargée en mémoire. Revenir à l'ancien tag et
  reconstruire (§ 5).
- Le dépôt du serveur est en « HEAD détachée » : c'est voulu, il est posé sur
  une version et non sur une branche.
- Un fichier de `deploy/` modifié par la version se réinstalle à la main
  (commandes de `README.md` § 6.3), puis `sudo systemctl daemon-reload`.

### 3.3 Vérification

```bash
sudo -u dateplanner -H git describe --tags          # v0.1.1
systemctl is-active dateplanner                     # active
sudo journalctl -u dateplanner -n 50 --no-pager     # « Ready », aucune erreur
curl -s -o /dev/null -w "%{http_code}\n" https://dateplanner.laserit.fr/api/sante   # 200
curl -s https://dateplanner.laserit.fr/api/sante    # ni "maintenance":"late", ni "backup":"late"
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
