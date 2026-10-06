# Contrat — routes HTTP

Routes hors Server Actions. Toutes en HTTPS derrière Traefik ; une requête reçue en clair est
renvoyée en 308 vers `https://dateplanner.laserit.fr`, sauf depuis l'hôte local.

## `GET /api/connexion/google?suite={chemin}`

Départ vers Google. Pose le cookie signé `dp_google` (`HttpOnly`, `Secure`, 10 min) portant
`state`, vérificateur PKCE et `suite` analysé. Répond 302 vers l'autorisation Google
(`scope=openid email profile`, `code_challenge_method=S256`). Seau `googleSigninPerIp`.

## `GET /api/connexion/google/retour?code&state`

- Compare `state` au cookie signé, puis efface le cookie **dans tous les cas**.
- Échange `code` côté serveur ; valide le jeton d'identité (`aud`, `iss`, `exp`,
  `email_verified = true`).
- Reconnaît par `googleId`, sinon rattache par adresse (compte non encore rattaché ; si
  l'adresse n'était pas prouvée : mot de passe effacé et sessions fermées), sinon crée le compte.
- Succès : session ouverte, 302 vers `suite` ou `/mes-sondages`.
- Échec ou annulation : 302 vers `/connexion?google={raison}`, raison prise dans une table fixe
  (`annule`, `refuse`, `adresse-non-verifiee`, `indisponible`), jamais une phrase.

## `GET /api/s/{publicId}/flux` — flux en direct (SSE)

- Public. `publicId` inconnu ⇒ 404 (le navigateur ne relance pas).
- Au-delà de 6 flux simultanés pour l'adresse, tous flux confondus ⇒ 429.
- En-têtes : `Content-Type: text/event-stream; charset=utf-8`,
  `Cache-Control: private, no-store, no-transform`, `X-Accel-Buffering: no`.
- Messages :

```text
retry: 3000

event: ready
data: {}

event: change
data: {"kind":"responses","at":"2026-09-30T14:02:11.412Z"}

: ping
```

| `kind` | Émis après |
|---|---|
| `responses` | réponse créée, modifiée, retirée ou supprimée par le créateur |
| `poll` | titre, description, jours, options, clôture, dates retenues ou réouverture modifiés |
| `deleted` | sondage supprimé (la page se relit et affiche « introuvable ») |

- Aucune donnée métier dans un événement : la page appelle `router.refresh()` et le rendu
  serveur relit la base. À chaque `ready` qui suit une coupure, la page se relit aussi.
- Battement `: ping` toutes les 25 s ; fermeture après 55 min, le navigateur rouvre seul.

## `GET /api/mes-sondages/flux` — flux en direct de « Mes sondages » (SSE)

- Session requise ; sans session ⇒ 404 (le navigateur ne relance pas).
- Annonce les changements des sondages créés par le compte ou auxquels il a répondu avec lui,
  lus à l'ouverture du flux ; la page le rouvre quand sa liste change (FR-044).
- Mêmes en-têtes, messages, `kind`, battement, durée de vie et limite par adresse que le flux
  d'un sondage. Un événement ne dit pas quel sondage a changé : la page se relit, et la
  bordure « du nouveau » apparaît. La page se relit aussi quand on revient sur l'onglet, pour
  effacer la bordure d'un sondage lu dans un autre onglet.

## `POST /api/maintenance`

- `Authorization: Bearer {CRON_SECRET}` ; sinon 401 sans corps explicatif.
- Exécute : expédition de la file d'emails, purges (sessions, jetons, seaux, emails envoyés),
  conservation (sondages à 12 mois du dernier jour, comptes inactifs : avertissement à 3 ans,
  suppression 30 jours après), horodatage `MaintenanceRun`.
- 200 `{ "sent": n, "purged": { … } }`. Idempotent : deux passages rapprochés ne doublent
  rien.

## `POST /api/notifications/resume/desactiver?t={jeton}`

Désinscription en un clic (RFC 8058, cible de `List-Unsubscribe-Post`). Même effet que
l'action `disableOwnerDigest`. 200 dans tous les cas (pas d'oracle sur la validité du jeton).

## `GET /api/sante`

200 `{ "status": "ok" }` si le processus répond ET qu'une requête `SELECT 1` aboutit ;
503 sinon. Ajoute `"maintenance": "late"` si le dernier passage date de plus de 30 min, et
`"backup": "late"` si la dernière sauvegarde réussie (`backup_run`, consignée par
`scripts/backup.sh`) date de plus de 26 h ou n'existe pas, sans changer le code 200. Aucun
détail interne. Destiné à une surveillance extérieure.

## `GET /robots.txt`, `GET /sitemap.xml`

`robots.txt` : `Disallow: /s/`, `/api/`, `/compte`, `/mes-sondages`, `/nouveau` ; pointe le
sitemap. `sitemap.xml` : `/`, `/mentions-legales`, `/confidentialite`.

## Cookies

| Nom | Contenu | Durée | Attributs |
|---|---|---|---|
| `dp_session` | jeton de session (256 bits) | glissante 30 j, plafond 90 j | `HttpOnly`, `Secure`, `SameSite=Lax` |
| `dp_appareil` | jeton d'appareil (256 bits) | 13 mois | `HttpOnly`, `Secure`, `SameSite=Lax` |
| `dp_google` | aller-retour Google signé | 10 min | `HttpOnly`, `Secure`, `SameSite=Lax` |

Le choix du thème vit dans `localStorage` (`dp-theme`), jamais dans un cookie.
