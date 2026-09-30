import { describe, expect, it } from 'vitest';
import { PASSWORD } from '@/config/limits';
import { missingPasswordRules, PASSWORD_HINT, passwordRulesMessage } from '@/lib/password-rules';
import { loginSchema, registerSchema, resetPasswordSchema } from '@/lib/validation';

/**
 * Un mot de passe CHOISI tient la recommandation de la CNIL (FR-002) :
 * longueur et quatre familles de caractères. La connexion, elle, accepte ce qui
 * existe.
 */

const identity = { displayName: 'Alice', email: 'alice@example.test' };

describe('règles d’un nouveau mot de passe', () => {
  it('nomme ce qui manque, et rien quand tout y est', () => {
    expect(missingPasswordRules('motdepasselong')).toEqual(['une majuscule', 'un chiffre', 'un caractère spécial']);
    expect(missingPasswordRules('Mot-de-passe-9')).toEqual([]);
    // Les lettres accentuées comptent comme des lettres, pas comme des signes.
    expect(missingPasswordRules('Éléphant-rose-9')).toEqual([]);
    expect(passwordRulesMessage('MOTDEPASSE-99')).toBe('Ajoutez une minuscule.');
  });

  it('refuse à l’inscription un mot de passe sans les quatre familles', () => {
    const weak = registerSchema.safeParse({ ...identity, password: 'correct-horse-battery' });
    expect(weak.success).toBe(false);
    expect(weak.error?.issues[0]?.message).toBe('Ajoutez une majuscule et un chiffre.');
    expect(registerSchema.safeParse({ ...identity, password: 'Correct-horse-battery-8' }).success).toBe(true);
  });

  it('dit la longueur avant les familles', () => {
    const short = registerSchema.safeParse({ ...identity, password: 'Ab1-' });
    expect(short.error?.issues[0]?.message).toBe(`Au moins ${PASSWORD.min} caractères.`);
  });

  it('applique la même règle à la réinitialisation', () => {
    expect(resetPasswordSchema.safeParse({ token: 'x'.repeat(40), password: 'toutenminuscules' }).success).toBe(false);
  });

  it('laisse se connecter avec un mot de passe existant, quelle que soit sa forme', () => {
    expect(loginSchema.safeParse({ email: 'alice@example.test', password: 'correct-horse' }).success).toBe(true);
  });

  it('annonce sous le champ la règle qu’il applique', () => {
    expect(PASSWORD_HINT).toBe(
      `Au moins ${PASSWORD.min} caractères, dont une minuscule, une majuscule, un chiffre et un caractère spécial.`,
    );
  });
});
