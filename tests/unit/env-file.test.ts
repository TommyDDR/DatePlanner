import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Le `.env` tel que le lisent `backup.sh` et `restore.sh`
 * (`scripts/lib/env-file.sh`), contre celui que systemd donne au service.
 *
 * Un `source .env` a arrêté la sauvegarde six nuits de suite sur un mot de
 * passe à espaces : ces cas sont ceux qui cassent un shell et que systemd lit
 * sans broncher. Bash est celui du serveur : sous Windows, `bash` peut
 * désigner celui de WSL, sans rapport avec le poste, et le test ne s'y lance
 * pas.
 */
describe.skipIf(process.platform === 'win32')('Lecture du .env par les scripts', () => {
  it('lit les valeurs comme systemd, sans jamais les exécuter', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-file-'));
    const marker = join(dir, 'execute');
    const envFile = join(dir, '.env');
    writeFileSync(
      envFile,
      [
        '# commentaire',
        '; autre commentaire',
        '',
        'SMTP_PASSWORD=abcd efgh ijkl mnop',
        'DATABASE_URL=postgresql://u:p@localhost:5432/db?schema=public&x=1>y',
        "QUOTED='a > b ; c'",
        'DOUBLE="dit \\"bonjour\\""',
        'export EXPORTED=1',
        `EVIL=$(touch ${marker}) \`touch ${marker}\` $HOME`,
        '  SPACED  =  valeur  ',
        'CRLF=windows\r',
        'LAST=sans-fin-de-ligne',
      ].join('\n'),
    );

    const keys = ['SMTP_PASSWORD', 'DATABASE_URL', 'QUOTED', 'DOUBLE', 'EXPORTED', 'EVIL', 'SPACED', 'CRLF', 'LAST'];
    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source scripts/lib/env-file.sh; load_env_file "$1"; shift; for k in "$@"; do printf "%s=%s\\n" "$k" "${!k}"; done',
        '_',
        envFile,
        ...keys,
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    try {
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const read = Object.fromEntries(
        result.stdout
          .trim()
          .split('\n')
          .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
      );
      expect(read).toEqual({
        SMTP_PASSWORD: 'abcd efgh ijkl mnop',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public&x=1>y',
        QUOTED: 'a > b ; c',
        DOUBLE: 'dit "bonjour"',
        EXPORTED: '1',
        EVIL: `$(touch ${marker}) \`touch ${marker}\` $HOME`,
        SPACED: 'valeur',
        CRLF: 'windows',
        LAST: 'sans-fin-de-ligne',
      });
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
