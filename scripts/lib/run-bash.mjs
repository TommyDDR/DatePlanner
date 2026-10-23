/**
 * Lance un script bash depuis `npm run`, avec le bash de Git sous Windows.
 *
 *   node scripts/lib/run-bash.mjs scripts/release.sh [arguments…]
 *
 * Sous Windows, `npm run` passe par cmd.exe, et `bash` y désigne souvent
 * celui de WSL (`System32`, `WindowsApps`) : une autre machine, sans les clés
 * SSH ni l'authentification de gh du poste. Le bash de Git est retrouvé à
 * partir de `git --exec-path` (`…/Git/mingw64/libexec/git-core`) ; `GIT_BASH`
 * en désigne un autre. Ailleurs, c'est le `bash` du PATH.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function gitBash() {
  if (process.env.GIT_BASH) return process.env.GIT_BASH;
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const bash = join(execPath, '..', '..', '..', 'bin', 'bash.exe');
  if (!existsSync(bash)) {
    console.error(`Bash de Git introuvable (${bash}) : le désigner par GIT_BASH.`);
    process.exit(1);
  }
  return bash;
}

const bash = process.platform === 'win32' ? gitBash() : 'bash';
const result = spawnSync(bash, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
