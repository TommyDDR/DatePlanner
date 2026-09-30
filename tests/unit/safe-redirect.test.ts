import { describe, expect, it } from 'vitest';
import { safeInternalPath } from '@/lib/safe-redirect';

/**
 * La destination de retour après connexion est ANALYSÉE, jamais reconnue à
 * son préfixe : sinon la page de connexion deviendrait un tremplin de
 * hameçonnage.
 */
describe('safeInternalPath', () => {
  it('rend un chemin du site, requête et ancre comprises', () => {
    expect(safeInternalPath('/s/abcdefghijklmnopqrstuv?cree=1#lien', '/mes-sondages')).toBe(
      '/s/abcdefghijklmnopqrstuv?cree=1#lien',
    );
  });

  it('refuse une adresse absolue ou sans schéma', () => {
    expect(safeInternalPath('https://exemple.test/', '/mes-sondages')).toBe('/mes-sondages');
    expect(safeInternalPath('//exemple.test/', '/mes-sondages')).toBe('/mes-sondages');
  });

  it("refuse l'antislash, que les navigateurs lisent comme une autorité", () => {
    expect(safeInternalPath('/\\exemple.test', '/mes-sondages')).toBe('/mes-sondages');
    expect(safeInternalPath('/\\\\exemple.test', '/mes-sondages')).toBe('/mes-sondages');
    expect(new URL('/\\exemple.test', 'https://dateplanner.laserit.fr').origin).toBe('https://exemple.test');
  });

  it('refuse tabulations et retours ligne, retirés par les navigateurs avant analyse', () => {
    expect(safeInternalPath('/\t/exemple.test', '/mes-sondages')).toBe('/mes-sondages');
    expect(safeInternalPath('/\n//exemple.test', '/mes-sondages')).toBe('/mes-sondages');
    expect(safeInternalPath('/\r/exemple.test', '/mes-sondages')).toBe('/mes-sondages');
  });

  it('refuse ce qui ne commence pas par une barre oblique', () => {
    expect(safeInternalPath('exemple.test', '/mes-sondages')).toBe('/mes-sondages');
    expect(safeInternalPath('', '/nouveau')).toBe('/nouveau');
  });
});
