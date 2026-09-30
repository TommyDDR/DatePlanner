import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE, SESSION } from '@/config/limits';
import { PROXY_RETENTION, RETENTION } from '@/config/retention';
import { duration, secondsInWords } from '@/lib/duration-words';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { GOOGLE_HANDSHAKE_COOKIE } from '@/server/auth/google-handshake';
import PrivacyPage from '@/app/confidentialite/page';
import LegalNoticePage from '@/app/mentions-legales/page';
import { IDENTITY } from '@/config/identity';

/**
 * La politique de confidentialité est un texte publié : elle engage (FR-036).
 * Ces tests confrontent chaque durée annoncée à celle que le service applique.
 */

function text(page: () => React.ReactNode): string {
  return renderToStaticMarkup(createElement(page))
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('duration', () => {
  it('écrit une durée comme on la dit', () => {
    expect(duration(1, 'an')).toBe('un an');
    expect(duration(3, 'an')).toBe('3 ans');
    expect(duration(12, 'mois')).toBe('12 mois');
    expect(duration(1, 'heure')).toBe('une heure');
    expect(secondsInWords(3600)).toBe('une heure');
    expect(secondsInWords(600)).toBe('10 minutes');
    expect(secondsInWords(30 * 86_400)).toBe('30 jours');
    expect(secondsInWords(396 * 86_400)).toBe('13 mois');
  });
});

describe('politique de confidentialité', () => {
  it('annonce les durées que le service applique', () => {
    const page = text(PrivacyPage);
    expect(page).toContain(`supprimés ${RETENTION.pollMonthsAfterLastDay} mois après leur dernier jour proposé`);
    expect(page).toContain(`après ${RETENTION.inactiveAccountYears} ans sans activité`);
    expect(page).toContain(`dans les ${RETENTION.deletionDaysAfterWarning} jours qui suivent`);
    expect(page).toContain(`${RETENTION.sentEmailDays} jours après leur mise en file`);
    expect(page).toContain(`valables ${secondsInWords(RETENTION.passwordResetMinutes * 60)}`);
    expect(page).toContain(`anti-abus : ${RETENTION.rateLimitHitHours} heures`);
    expect(page).toContain(`serveur d’entrée : ${PROXY_RETENTION.accessLogDays} jours`);
    expect(page).toContain(`CrowdSec : ${PROXY_RETENTION.alertsDays} jours au plus`);
  });

  it('suit la configuration au lieu de la recopier', () => {
    const saved = { ...RETENTION };
    const mutable = RETENTION as { -readonly [K in keyof typeof RETENTION]: number };
    try {
      mutable.pollMonthsAfterLastDay = 7;
      mutable.inactiveAccountYears = 1;
      mutable.sentEmailDays = 45;
      const page = text(PrivacyPage);
      expect(page).toContain('supprimés 7 mois après');
      expect(page).toContain('après un an sans activité');
      expect(page).toContain('45 jours après leur mise en file');
    } finally {
      Object.assign(mutable, saved);
    }
  });

  it('nomme chaque cookie et le stockage du thème, avec leur durée', () => {
    const page = text(PrivacyPage);
    for (const name of [SESSION.cookieName, DEVICE.cookieName, GOOGLE_HANDSHAKE_COOKIE, THEME_STORAGE_KEY]) {
      expect(page).toContain(name);
    }
    expect(page).toContain(`après ${secondsInWords(SESSION.maxAgeSeconds)} d’inactivité`);
    expect(page).toContain(`${secondsInWords(SESSION.absoluteMaxAgeSeconds)} après la connexion`);
    expect(page).toContain(`Il dure ${secondsInWords(DEVICE.maxAgeSeconds)}`);
  });

  it('ne nomme Google que s’il reçoit des données', () => {
    vi.stubEnv('EMAIL_DRIVER', 'console');
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    const quiet = text(PrivacyPage);
    expect(quiet).not.toContain('Google LLC');
    expect(quiet).not.toContain('connecter avec Google');

    vi.stubEnv('GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret-de-test');
    const withGoogle = text(PrivacyPage);
    expect(withGoogle).toContain('connecter avec Google');
    expect(withGoogle).toContain('Google LLC');
  });
});

describe('mentions légales', () => {
  it('identifient l’éditeur et l’hébergeur', () => {
    const page = text(LegalNoticePage);
    for (const value of [
      IDENTITY.legal.entityName,
      IDENTITY.legal.siret,
      IDENTITY.legal.address,
      IDENTITY.legal.publicationDirector,
      IDENTITY.phone,
      IDENTITY.email,
    ]) {
      expect(page).toContain(value);
    }
  });
});
