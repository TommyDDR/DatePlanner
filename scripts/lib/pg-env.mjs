/**
 * Traduit `DATABASE_URL` en variables d'environnement libpq, pour les scripts
 * shell qui appellent `pg_dump`, `pg_restore` et `psql`.
 *
 *   eval "$(node scripts/lib/pg-env.mjs)"
 *
 * libpq n'interprète PAS une URL posée dans `PGDATABASE` : il la prend pour un
 * nom de base, se connecte sans utilisateur ni mot de passe, et échoue sur
 * « no password supplied ». La mettre en argument (`--dbname=<url>`) marcherait,
 * mais exposerait le mot de passe dans `/proc/<pid>/cmdline`, lisible de tout
 * compte de la machine. Les variables `PG*`, elles, ne sont lisibles que du
 * propriétaire du processus.
 *
 * Le paramètre `schema` de Prisma n'est pas une option libpq : il est ignoré,
 * le schéma `public` étant celui de la base.
 */
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL n'est pas définie.");
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("DATABASE_URL n'est pas une URL de connexion valide.");
  process.exit(1);
}
if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
  console.error('DATABASE_URL ne désigne pas une base PostgreSQL.');
  process.exit(1);
}

/** Une valeur entre apostrophes, sûre pour `eval` dans un shell POSIX. */
const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;

const vars = {
  PGHOST: url.hostname,
  PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
};
const sslmode = url.searchParams.get('sslmode');
if (sslmode) vars.PGSSLMODE = sslmode;

for (const [name, value] of Object.entries(vars)) {
  if (value !== '') console.log(`export ${name}=${quote(value)}`);
}
