# Supervision du conteneur de DatePlanner

Décision : `docs/decisions/044-supervision.md`.

La supervision de l'hyperviseur - conteneur 203 `supervision`, Prometheus,
Loki, Grafana, alertes par email et battement vers Healthchecks.io - est
décrite et versionnée dans le dépôt de laserit.fr, `deploy/supervision/`. Son
guide (`deploy/supervision/README.md` de laserit.fr) installe le CT 203 et
l'Alloy des autres machines ; ce fichier-ci n'installe que celui du CT 202.

Ce qui part d'ici vers le CT 203 :

- les mesures de la machine : disque, mémoire, unités `dateplanner*` et
  PostgreSQL ;
- l'état de la file d'envoi : en attente, abandonnés, ancienneté du plus
  ancien dû (`dateplanner-queries.yaml`) - des décomptes, jamais un contenu ;
- le journal des seules unités `dateplanner*`, gardé
  `SUPERVISION_RETENTION.logsDays` jours (`src/config/retention.ts`), comme
  journald, et annoncé par la politique de confidentialité. Chaque erreur que
  Next capte y écrit une ligne `{"event":"server_error",…}`
  (`src/instrumentation.ts`), que l'alerte « Erreurs serveur » compte.

Les règles d'alerte de laserit.fr couvrent DatePlanner sans rien y ajouter :
elles portent sur toutes les machines, et les sondes de `/api/sante` du CT
203 interrogent déjà `https://dateplanner.laserit.fr`.

---

## Installation sur le CT 202

Le dépôt APT de Grafana Labs, puis Alloy :

```bash
sudo apt install -y gpg curl
sudo install -d -m 755 /etc/apt/keyrings
curl -fsSL https://apt.grafana.com/gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/grafana.gpg
echo "deb [signed-by=/etc/apt/keyrings/grafana.gpg] https://apt.grafana.com stable main" \
  | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt update && sudo apt install -y alloy
```

Les fichiers, depuis le poste de développement, à la racine du dépôt :

```bash
scp deploy/supervision/dateplanner.alloy deploy/supervision/dateplanner-queries.yaml \
  deploy/supervision/alloy.default admin@192.168.1.53:
```

Puis sur le conteneur. Le rôle `alloy` lit les statistiques (`pg_monitor`)
et TROIS colonnes de la file d'envoi : ni le destinataire, ni le contenu, ni
aucune autre table.

```bash
sudo cp ~/dateplanner.alloy /etc/alloy/config.alloy
sudo cp ~/dateplanner-queries.yaml /etc/alloy/dateplanner-queries.yaml
sudo cp ~/alloy.default /etc/default/alloy
sudo usermod -aG systemd-journal alloy
sudo -u postgres psql -d dateplanner \
  -c 'CREATE ROLE alloy LOGIN' \
  -c 'GRANT pg_monitor TO alloy' \
  -c 'GRANT USAGE ON SCHEMA public TO alloy' \
  -c 'GRANT SELECT ("status", "send_after", "created_at") ON "email_outbox" TO alloy'
sudo systemctl enable --now alloy && sudo systemctl restart alloy
systemctl status alloy --no-pager
```

Le vérifier :

- `sudo -u alloy psql -d dateplanner -c 'SELECT "to" FROM "email_outbox" LIMIT 1'`
  doit répondre « droit refusé » ;
- dans Grafana (http://192.168.1.54:3000), « Explore » :
  `up{host="dateplanner"}`, `node_systemd_unit_state{host="dateplanner"}` et
  `email_outbox_pending{host="dateplanner"}` côté Prometheus,
  `{job="journal", host="dateplanner"}` côté Loki. Unités vides : le bus
  système manque au conteneur, `sudo apt install -y dbus`, puis redémarrer
  Alloy.

L'interface d'Alloy (http://127.0.0.1:12345, par
`ssh -L 12345:127.0.0.1:12345 admin@192.168.1.53`) montre chaque composant
et son état : un composant en rouge dit pourquoi.

Une configuration changée dans le dépôt se recopie de la même façon, suivie
de `sudo systemctl restart alloy`.
