import { PASSWORD } from '@/config/limits';
import { enumerate } from '@/lib/text';

/**
 * Ce qu'un nouveau mot de passe doit contenir - module PUR (FR-002).
 *
 * La CNIL (délibération n° 2022-100) mesure un mot de passe à son entropie :
 * cinquante bits au moins quand l'accès est bridé après des échecs, ce que
 * font ici le verrou progressif du compte et le seau `loginPerIp`. Dix
 * caractères pris dans les quatre familles en donnent plus de soixante.
 *
 * Une seule définition, lue par le schéma (le serveur tranche) et par
 * l'indication sous chaque champ : la règle qu'on annonce est celle qu'on
 * applique. Elle ne vaut que pour un mot de passe qu'on CHOISIT - la
 * connexion accepte celui qui existe.
 */
const RULES: ReadonlyArray<{ label: string; test: RegExp }> = [
  { label: 'une minuscule', test: /\p{Ll}/u },
  { label: 'une majuscule', test: /\p{Lu}/u },
  { label: 'un chiffre', test: /\p{Nd}/u },
  { label: 'un caractère spécial', test: /[^\p{L}\p{N}]/u },
];

/** Ce qui manque au mot de passe, en toutes lettres : `[]` s'il ne manque rien. */
export function missingPasswordRules(password: string): string[] {
  return RULES.filter((rule) => !rule.test.test(password)).map((rule) => rule.label);
}

/** « Ajoutez une majuscule et un chiffre. », ou `null`. */
export function passwordRulesMessage(password: string): string | null {
  const missing = missingPasswordRules(password);
  return missing.length === 0 ? null : `Ajoutez ${enumerate(missing)}.`;
}

/** L'indication posée sous chaque champ où l'on choisit un mot de passe. */
export const PASSWORD_HINT = `Au moins ${PASSWORD.min} caractères, dont ${enumerate(RULES.map((rule) => rule.label))}.`;
