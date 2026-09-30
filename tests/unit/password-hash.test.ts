import { describe, expect, it } from 'vitest';
import { fakeVerify, hashPassword, verifyOptionalPassword, verifyPassword } from '@/server/auth/password';

describe('hachage des mots de passe', () => {
  it('produit une empreinte argon2id qui se vérifie', async () => {
    const stored = await hashPassword('Mot-de-passe-9');
    expect(stored).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(stored, 'Mot-de-passe-9')).toBe(true);
    expect(await verifyPassword(stored, 'Mot-de-passe-8')).toBe(false);
  });

  it('ne lève pas sur une empreinte corrompue', async () => {
    expect(await verifyPassword('pas-une-empreinte', 'x')).toBe(false);
  });

  it('refuse un compte sans mot de passe, au prix d’une vraie vérification', async () => {
    expect(await verifyOptionalPassword(null, 'Mot-de-passe-9')).toBe(false);
  });

  it('exécute le hachage factice sans lever', async () => {
    await expect(fakeVerify('quelconque')).resolves.toBeUndefined();
  });
});
