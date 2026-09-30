import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Hygiène du dépôt (constitution I, « aucun secret versionné » ; VI, versions
 * exactes).
 *
 * Ce que git SUIT est ce qui part sur GitHub : c'est donc la liste de git qui
 * est relue, pas l'arbre de travail, où `.env` existe légitimement.
 */

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((path) => path.length > 0);
}

const TEXT_EXTENSIONS = /\.(ts|tsx|js|mjs|cjs|json|md|yml|yaml|css|sql|prisma|sh|service|timer|conf|txt|example)$/;

describe('secrets', () => {
  it('ne suit aucun fichier .env hormis .env.example', () => {
    const envFiles = trackedFiles().filter((path) => /(^|\/)\.env/.test(path));
    expect(envFiles.filter((path) => !path.endsWith('.env.example'))).toEqual([]);
  });

  it('ignore .env et .env.test', () => {
    const ignored = execFileSync('git', ['check-ignore', '--no-index', '.env', '.env.test'], {
      encoding: 'utf8',
    });
    expect(ignored.split(/\r?\n/).filter(Boolean)).toEqual(['.env', '.env.test']);
  });

  it("ne laisse aucune clé privée ni aucun secret valorisé dans les fichiers suivis", () => {
    const privateKey = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
    // Une affectation de secret AVEC valeur : `APP_SECRET=abc`, `SMTP_PASSWORD: "x"`.
    // Les références (`process.env.APP_SECRET`, `$APP_SECRET`) ne comptent pas.
    // `[ \t]` et non `\s` : une valeur vide ne doit pas être lue avec la ligne
    // suivante.
    const valuedSecret =
      /^[ \t]*(?:export[ \t]+)?[A-Z0-9_]*(?:_SECRET|_PASSWORD|CLIENT_SECRET)[ \t]*[=:][ \t]*["']?(?!\$)[^\s"'$]+/m;

    const offenders: string[] = [];
    for (const path of trackedFiles()) {
      if (!TEXT_EXTENSIONS.test(path) || path.startsWith('tests/')) continue;
      // La CI et les parcours de bout en bout portent des valeurs de TEST,
      // publiques et factices : ce ne sont pas des secrets du service.
      if (path === '.github/workflows/ci.yml' || path === 'playwright.config.ts') continue;
      const content = readFileSync(path, 'utf8');
      if (privateKey.test(content) || valuedSecret.test(content)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });

  it(".env.example ne porte aucune valeur", () => {
    const lines = readFileSync('.env.example', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith('#'));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/^[A-Z0-9_]+=$/);
  });
});

describe('dépendances', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as Record<string, Record<string, string> | undefined>;

  it.each(['dependencies', 'devDependencies', 'overrides'])('déclare des versions exactes (%s)', (field) => {
    const versions = Object.entries(pkg[field] ?? {});
    const ranged = versions.filter(([, version]) => !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version));
    expect(ranged).toEqual([]);
  });

  it('garde save-exact dans .npmrc', () => {
    expect(readFileSync('.npmrc', 'utf8')).toMatch(/^save-exact=true$/m);
  });
});
