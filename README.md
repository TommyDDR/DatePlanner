# DatePlanner

Sondages de dates en ligne, sur `https://dateplanner.laserit.fr`. Un créateur
propose des jours, partage un lien ; chacun coche ses disponibilités, avec un
compte ou sous un simple pseudo, et les votes s'affichent en direct chez tout
le monde.

Service autonome, construit sur le socle de laserit.fr : même pile, même
thème, même infrastructure. L'état du projet, la carte du code et ses
invariants sont dans `PROJET.md` ; les décisions, une par fichier, dans
`docs/decisions/` ; la spécification complète dans `specs/001-date-poll/`.

---

## 1. Pile

Next.js 16 (App Router, Server Actions), React 19, TypeScript 5.9, Tailwind 4,
PostgreSQL 17 par Prisma 7, Zod 4, argon2id (`@node-rs/argon2`), Nodemailer 10.
Tests : Vitest (modules purs et intégration contre une vraie base), Playwright
(Chromium) et axe. Versions exactes dans `package.json` (`.npmrc` :
`save-exact=true`).

---

## 2. Démarrage en local

Prérequis : Node.js 22 LTS, npm, PostgreSQL 17 avec deux bases, `dateplanner`
(développement) et `dateplanner_test` (tests, vidée à chaque passage).

```bash
npm ci
cp .env.example .env          # puis renseigner les valeurs (§ 3)
cp .env.example .env.test     # DATABASE_URL vers dateplanner_test, EMAIL_DRIVER=console
npx prisma migrate deploy
npm run dev                   # http://localhost:3000
```

### Commandes

```bash
npm run typecheck    # tsc
npm run lint         # ESLint
npm test             # Vitest : unitaires puis intégration (dateplanner_test)
npm run e2e          # Playwright, sur un serveur de test dédié (port 3100)
npm run e2e:perf     # SC-005 sur un build de production (port 3101)
npm run build        # build de production
npm run db:migrate   # nouvelle migration en développement
npm run db:studio    # explorer la base
```

Les tests d'intégration et les parcours vident les tables : ils refusent une
base dont le nom ne finit pas par `_test`.

Maintenance à la main (emails en attente, conservation, purges) :

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/maintenance
curl http://localhost:3000/api/sante
```

---

## 3. Variables d'environnement

`.env.example` les liste toutes, sans valeur. Aucun secret n'est versionné, et
un test d'hygiène du dépôt le vérifie.

| Variable | Rôle | Développement | Production |
|---|---|---|---|
| `DATABASE_URL` | base PostgreSQL | `…/dateplanner` | `…/dateplanner` dans le conteneur |
| `NEXT_PUBLIC_SITE_URL` | adresse publique (liens des emails, métadonnées) | `http://localhost:3000` | `https://dateplanner.laserit.fr` |
| `EDITOR_NAME`, `EDITOR_ADDRESS` | éditeur et hébergeur des mentions légales | vides (repère « non renseigné ») | nom complet et adresse postale |
| `APP_SECRET` | signatures : cookie Google, liens de désactivation | 32 octets aléatoires | idem, propre à la production |
| `CRON_SECRET` | appel de la maintenance | valeur aléatoire | idem |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | connexion Google (§ 5) | client de développement | client de production |
| `EMAIL_DRIVER` | `console`, `gmail` ou `smtp` | `console` | `gmail` |
| `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | envoi réel (§ 4) | vides | compte Gmail |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | pilote `smtp` seulement | vides | vides |
| `RATE_LIMIT_DISABLED` | neutralise l'anti-flood, jamais en production | `1` si besoin | vide |
| `RATE_LIMIT_ALLOWLIST` | adresses exemptées, séparées par des virgules | vide | selon besoin |
| `ADMIN_EMAILS` | comptes administrateurs, séparés par des virgules (ci-dessous) | son adresse, si besoin | adresse de l'éditeur |

Tirer un secret : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Une variable `NEXT_PUBLIC_…` est gravée dans les pages au build : la changer
demande un nouveau build, pas seulement un redémarrage. Un build de
production refuse une adresse publique en `http`, et un éditeur absent.

**Administrateur** (décision 042). Un compte dont l'adresse figure dans
`ADMIN_EMAILS` a le menu « Administration » (utilisateurs, tous les
sondages), une fois son adresse **prouvée** : se connecter avec Google sous
cette adresse, ou, pour un compte à mot de passe, passer une fois par « Mot de
passe oublié » et suivre le lien reçu. La variable n'est pas gravée au build :
la changer demande un redémarrage, pas un nouveau build.

---

## 4. Envoi des emails

Avec `EMAIL_DRIVER=console`, **aucun email réel ne part** : chacun est écrit
dans le terminal. Les emails du service : réinitialisation du mot de passe,
résumé des nouvelles réponses au créateur, annonce des dates retenues,
avertissement avant suppression d'un compte inactif.

**Gmail** (production, compte `notificationslaserit@gmail.com`) : la
validation en deux étapes doit être active sur le compte, puis un **mot de
passe d'application** se crée sur `myaccount.google.com/apppasswords`. Le mot
de passe du compte lui-même est toujours refusé par le serveur d'envoi.

```dotenv
EMAIL_DRIVER=gmail
SMTP_USER=notificationslaserit@gmail.com
# Le mot de passe d'application (16 caractères), saisi sur le serveur seulement.
SMTP_PASSWORD=
EMAIL_FROM=DatePlanner
```

Hôte, port et chiffrement sont déduits du pilote. L'adresse d'expédition reste
celle du compte (Gmail réécrit l'en-tête `From`) ; seul le nom affiché de
`EMAIL_FROM` est repris.

Un email n'est jamais envoyé pendant l'action qui le déclenche : il est mis en
file dans la même transaction, puis expédié. Une panne de messagerie ne fait
échouer aucune action ; la maintenance retente, et marque l'email en échec
après cinq essais.

---

## 5. Connexion avec un compte Google

Le bouton « Continuer avec Google » n'apparaît que si les deux variables
`GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont renseignées.

1. Console Google Cloud, **même projet que laserit.fr**.
2. **Écran de consentement OAuth** : externe, publié, avec le lien vers
   `https://dateplanner.laserit.fr/confidentialite`. Les autorisations
   demandées (`openid email profile`) ne sont pas sensibles.
3. **Identifiants > ID client OAuth 2.0**, type « Application Web ». URI de
   redirection autorisés, **au caractère près** :
   - `http://localhost:3000/api/connexion/google/retour` pour développer ;
   - `https://dateplanner.laserit.fr/api/connexion/google/retour` en production.
4. Reporter l'identifiant et le secret dans `.env`, puis redémarrer.

Un compte local de même adresse est retrouvé, sans doublon, si Google a
confirmé l'adresse. Si ce compte local n'avait jamais prouvé son adresse, son
mot de passe est effacé et ses sessions fermées au rattachement : quelqu'un
qui l'aurait créé au nom d'autrui en perd l'accès.

---

## 6. Mise en production - première installation

La production est auto-hébergée sur l'hyperviseur Proxmox de laserit.fr, où
chaque service a son conteneur LXC (décision 043). Le conteneur proxy, déjà
en place, reçoit seul les ports 80 et 443 et termine le HTTPS ; DatePlanner a
son propre conteneur.

```
internet ── box (80, 443) ── CT 201 proxy : Traefik + CrowdSec ── CT 202 dateplanner : Next :3000 + PostgreSQL
```

| Machine | Adresse | Rôle |
|---|---|---|
| Hôte Proxmox | `192.168.1.10` | snapshots des conteneurs |
| CT 201 `proxy` | `192.168.1.51` | HTTPS, certificats, CrowdSec |
| CT 202 `dateplanner` | `192.168.1.53` | code dans `/opt/dateplanner`, service `dateplanner`, compte `dateplanner` |

### 6.1 Le conteneur

Conteneur LXC non privilégié, Debian 13, 2 cœurs, 2 Go de mémoire, 20 Go de
disque, créé depuis le modèle Debian 13 de Proxmox. Il reprend la MAC de
l'ancienne VM 102. L'adresse `192.168.1.53` est FIXÉE dans la configuration
du conteneur, pas par un bail de la box : la réserver sur la box, ou la tenir
hors de sa plage DHCP, évite qu'un autre appareil la reçoive.

Sur l'hôte Proxmox (`ssh root@192.168.1.10`) :

```bash
pveam update && pveam available --section system | grep debian-13
pveam download local debian-13-standard_<version>_amd64.tar.zst

pct create 202 local:vztmpl/debian-13-standard_<version>_amd64.tar.zst \
  --hostname dateplanner --unprivileged 1 --features nesting=1 \
  --cores 2 --memory 2048 --swap 512 --rootfs local-lvm:20 \
  --net0 name=eth0,bridge=vmbr0,hwaddr=BC:24:11:00:AA:0C,ip=192.168.1.53/24,gw=192.168.1.254,firewall=1 \
  --nameserver 192.168.1.254 --searchdomain lan \
  --timezone host --onboot 1 --startup order=3 --tags dateplanner \
  --ssh-public-keys /root/.ssh/authorized_keys
pct start 202

# Le compte admin (sudo sans mot de passe, la clé de root), puis SSH fermé à root.
pct exec 202 -- bash -c '
  apt update && apt install -y sudo
  useradd --create-home --shell /bin/bash --groups sudo admin
  install -d -m 700 -o admin -g admin /home/admin/.ssh
  install -m 600 -o admin -g admin /root/.ssh/authorized_keys /home/admin/.ssh/
  echo "admin ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/admin && chmod 440 /etc/sudoers.d/admin
  printf "PermitRootLogin no\nPasswordAuthentication no\n" > /etc/ssh/sshd_config.d/00-durcissement.conf
  systemctl restart ssh'
```

- `nesting=1` n'est pas optionnel : systemd de Debian 13 et le cloisonnement
  de `deploy/dateplanner.service` (`ProtectSystem`, `PrivateTmp`) créent des
  espaces de noms, et sans lui le service tombe en `226/NAMESPACE`.
- `--swap` puise dans le fichier d'échange de l'hôte : un conteneur n'en a
  pas à lui. L'horloge est celle de l'hôte, et `--timezone host` donne son
  fuseau au timer de sauvegarde de 3 h.

Le pare-feu est celui de Proxmox, décrit sur l'hôte et hors de portée du
conteneur : un root du conteneur ne pourrait pas l'ouvrir. Dans
`/etc/pve/firewall/202.fw` :

```
[OPTIONS]
enable: 1
policy_in: DROP

[RULES]
IN ACCEPT -source 192.168.1.51 -p tcp -dport 3000
IN ACCEPT -source 192.168.1.0/24 -p tcp -dport 22
```

Il ne s'applique que si le pare-feu du datacenter est activé (README de
laserit.fr, § 9). Sans la règle du port 3000, Next serait joignable en clair
depuis tout le réseau local : la seule porte d'entrée doit rester le proxy.
Le vérifier d'un poste du réseau local, qui n'est pas le proxy :
`curl http://192.168.1.53:3000/api/sante` doit échouer.

Puis dans le conteneur (`ssh admin@192.168.1.53`). Debian 13 fournit
PostgreSQL 17 ; Node.js 22 vient de NodeSource, comme pour laserit.fr :

```bash
sudo apt install -y curl git gnupg postgresql
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/nodesource.gpg
echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update && sudo apt install -y nodejs
```

### 6.2 Base, compte et code

```bash
sudo -u postgres createuser --pwprompt dateplanner       # ni CREATEDB, ni CREATEROLE
sudo -u postgres createdb --owner=dateplanner dateplanner

sudo useradd --system --home-dir /opt/dateplanner --shell /usr/sbin/nologin dateplanner
sudo git clone https://github.com/TommyDDR/DatePlanner.git /opt/dateplanner   # dépôt public
sudo chown -R dateplanner:dateplanner /opt/dateplanner

sudo -u dateplanner cp /opt/dateplanner/.env.example /opt/dateplanner/.env
sudo chmod 600 /opt/dateplanner/.env
sudoedit /opt/dateplanner/.env      # valeurs de production (§ 3), NODE_ENV=production
```

Le mot de passe de la base, `APP_SECRET` et `CRON_SECRET` se tirent au hasard
dans le conteneur (commande du § 3) et ne s'écrivent que dans ce fichier.

Le premier déploiement d'une version suit ensuite `deploy.md` § 3 (checkout
du tag, `npm ci`, `prisma migrate deploy`, build).

### 6.3 Unités systemd

```bash
cd /opt/dateplanner
sudo cp deploy/dateplanner.service deploy/dateplanner-maintenance.* deploy/dateplanner-backup.* /etc/systemd/system/
sudo mkdir -p /etc/systemd/system/dateplanner.service.d
sudo cp deploy/dateplanner-proxy-distant.conf /etc/systemd/system/dateplanner.service.d/override.conf
sudo mkdir -p /etc/systemd/journald.conf.d
sudo cp deploy/journald-dateplanner.conf /etc/systemd/journald.conf.d/dateplanner.conf
sudo systemctl restart systemd-journald
sudo systemctl daemon-reload
sudo systemctl enable dateplanner dateplanner-maintenance.timer dateplanner-backup.timer
# Démarrage APRÈS le premier build (deploy.md § 3) : sans lui, le service boucle puis abandonne.
systemctl list-timers 'dateplanner-*'
```

- `dateplanner.service` lit ses secrets dans `/opt/dateplanner/.env`
  (`EnvironmentFile`), jamais dans l'unité, où `systemctl show` les
  exposerait ; il abandonne après cinq démarrages ratés en une minute.
- Le complément `proxy-distant` fait écouter Next sur le réseau et borne son
  tas à 1 Go.
- La maintenance passe toutes les dix minutes, en boucle locale ;
  `/api/sante` signale un retard au-delà de trente minutes.
- La sauvegarde (`scripts/backup.sh`) passe chaque nuit vers 3 h, sous root.

### 6.4 DNS chez OVH

Espace client OVH > Noms de domaine > `laserit.fr` > Zone DNS > Ajouter une
entrée :

- type **CNAME**, sous-domaine `dateplanner`, cible `laserit.fr.` (avec le
  point final), TTL par défaut.

Le sous-domaine suit ainsi l'adresse de `laserit.fr` sans rien à tenir à jour.
Vérifier, une fois la propagation faite :

```powershell
Resolve-DnsName dateplanner.laserit.fr     # <IP publique>, par le CNAME
```

### 6.5 Traefik, sur le conteneur proxy

```bash
scp deploy/traefik/dateplanner.yml admin@192.168.1.51:/tmp/
ssh admin@192.168.1.51 sudo cp /tmp/dateplanner.yml /etc/traefik/dynamic/
```

Traefik relit le répertoire de lui-même, obtient le certificat Let's Encrypt
de `dateplanner.laserit.fr` au premier accès et renvoie `http://` vers
`https://`. Il pose `X-Forwarded-Proto` et `X-Real-IP` en retirant ceux
qu'envoie le visiteur : sans le premier, tout serait redirigé en boucle ; sans
le second, l'anti-flood compterait tous les visiteurs comme un seul.

### 6.6 Snapshots, sur l'hôte Proxmox

Le snapshot d'avant déploiement (`deploy.md` § 3.1) est pris par
`deploy/dateplanner-snapshot.sh`, installé sur l'hôte :

```bash
scp deploy/dateplanner-snapshot.sh root@192.168.1.10:/usr/local/sbin/dateplanner-snapshot
ssh root@192.168.1.10 chmod 755 /usr/local/sbin/dateplanner-snapshot
```

Il nomme le snapshot d'après la version, puis ne garde que les deux plus
récents snapshots `avant_*` du conteneur 202 : celui du déploiement en cours et
celui du précédent. Un snapshot nommé autrement n'est jamais supprimé. Un
script modifié se réinstalle de la même façon.

### 6.7 Ce qui reste à l'exploitant

- **Sauvegardes hors du conteneur** : `scripts/backup.sh` écrit dans
  `/var/backups/dateplanner`, sur le disque même de la base. Copier ces
  archives ailleurs, de façon planifiée, fait partie de l'installation ; puis
  éprouver une restauration complète avec `scripts/restore.sh` sur une base
  vierge. Une sauvegarde jamais restaurée ne prouve rien.
- **Surveillance extérieure** de `https://dateplanner.laserit.fr/api/sante`,
  par un service tiers, toutes les 5 minutes, avec alerte par email : un
  service tombé ne peut pas prévenir qu'il est tombé. `/api/sante` répond 200
  seulement si le processus ET la base répondent.
- **Administrateur** : `ADMIN_EMAILS` dans `/opt/dateplanner/.env`, puis
  `sudo systemctl restart dateplanner` et une connexion qui prouve l'adresse
  (§ 3).

Les vérifications après mise en service sont dans
`specs/001-date-poll/quickstart.md` § 5. Les mises à jour suivantes :
`deploy.md`.
