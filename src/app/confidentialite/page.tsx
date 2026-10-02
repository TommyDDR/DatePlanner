import type { Metadata } from 'next';
import Link from 'next/link';
import { IDENTITY, readEditor } from '@/config/identity';
import { DEVICE, SESSION } from '@/config/limits';
import { PROXY_RETENTION, RETENTION } from '@/config/retention';
import { LegalPage, LegalSection } from '@/components/legal-page';
import { duration, secondsInWords } from '@/lib/duration-words';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { readGoogleOAuth } from '@/server/auth/google';
import { COOKIE_MAX_AGE_SECONDS, GOOGLE_HANDSHAKE_COOKIE } from '@/server/auth/google-handshake';
import { emailProcessor } from '@/server/notifications/transport';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Données traitées, durées de conservation, cookies et exercice de vos droits.',
  alternates: { canonical: '/confidentialite' },
  robots: { index: true, follow: true },
};

/**
 * Politique de confidentialité (FR-036).
 *
 * Chaque durée est LUE dans la configuration que le service applique - jamais
 * recopiée : une politique qui annonce douze mois pendant que la maintenance
 * en garde trente-six n'est pas seulement fausse, elle engage. Un test
 * confronte le texte rendu à `RETENTION`.
 */
export default function PrivacyPage() {
  // Écrits sous condition : annoncer un tiers que le service n'appelle pas
  // ferait dire au texte plus que ce que le service fait.
  const googleSignin = readGoogleOAuth() !== null;
  const mailer = emailProcessor();
  const transfers = mailer?.outsideEu || googleSignin;
  const editor = readEditor();
  const contact = (
    <a className="text-[var(--color-ember)] underline underline-offset-4" href={`mailto:${IDENTITY.email}`}>
      {IDENTITY.email}
    </a>
  );

  return (
    <LegalPage label="Confidentialité" title="Politique de confidentialité">
      <LegalSection title="Responsable du traitement">
        <p>
          {editor.name} - {editor.address}. Pour toute question sur vos données : {contact}.
        </p>
      </LegalSection>

      <LegalSection title="Données traitées">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Compte : adresse email, nom d’affichage, mot de passe (conservé uniquement sous forme de hachage argon2id)
            et, si vous vous connectez avec Google, l’identifiant de votre compte Google.
          </li>
          <li>
            Sondages : titre, description, jours proposés, options choisies, date retenue, et le compte qui l’a créé.
          </li>
          <li>
            Réponses : votre compte ou le pseudo que vous choisissez, les jours que vous cochez et la date de la
            réponse. Sans compte, la réponse est rattachée à votre appareil par l’empreinte d’un identifiant
            aléatoire, jamais par l’identifiant lui-même.
          </li>
          <li>
            « Mes sondages » : pour chaque sondage que vous avez créé ou auquel vous avez répondu avec votre compte,
            le repère du dernier changement que vous y avez vu, pour signaler ce qui a changé depuis. Il disparaît
            avec le sondage ou la réponse.
          </li>
          <li>
            Emails du service : destinataire, nature du message et date d’envoi, dans la file qui les achemine.
          </li>
          <li>
            Technique : adresse IP, adresse email visée ou compte, tenus en compteurs pour limiter les abus ;
            journal d’accès du serveur d’entrée (adresse IP, date, page demandée et réponse de chaque requête).
          </li>
        </ul>
        <p className="mt-3">
          Toute personne qui détient le lien d’un sondage en voit les réponses : pseudos ou noms d’affichage, et
          jours cochés. Les adresses email, elles, ne sont montrées à personne.
        </p>
      </LegalSection>

      <LegalSection title="Finalités et bases légales">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Fournir le service (comptes, sondages, réponses, emails de réinitialisation, résumés des nouvelles
            réponses, annonce de la date retenue) : <em>exécution du service demandé</em>.
          </li>
          <li>
            Assurer la sécurité du service (limitation des abus, verrouillage après des échecs de connexion,
            détection et blocage des attaques) : <em>intérêt légitime</em>.
          </li>
        </ul>
        <p className="mt-3">
          Aucun profilage, aucune publicité, aucune revente de données, aucune mesure d’audience, aucune décision
          automatisée.
        </p>
      </LegalSection>

      <LegalSection title="Destinataires">
        <p>
          Les données ne sont transmises à aucun tiers commercial. Le service est auto-hébergé, sur des serveurs
          exploités par l’éditeur ({editor.name}, {editor.address}).
        </p>
        <p className="mt-3">
          Le créateur d’un sondage peut recevoir par email un résumé des nouvelles réponses : pseudos ou noms
          d’affichage, et jours cochés. Quand il retient une date, les répondants connectés en sont prévenus par
          email.
        </p>
        {mailer ? (
          <p className="mt-3">
            Ces emails sont acheminés par {mailer.name}, qui en conserve une copie.
          </p>
        ) : null}
        {googleSignin ? (
          <p className="mt-3">
            Si vous choisissez de vous connecter avec Google, votre navigateur passe par la page de connexion de
            Google, qui apprend alors que vous vous connectez à ce service. Le service ne reçoit en retour que votre
            adresse email, votre nom et l’identifiant de votre compte Google, et ne charge aucun script de Google sur
            ses pages. Rien ne part vers Google tant que vous n’avez pas cliqué sur ce bouton.
          </p>
        ) : null}
        <p className="mt-3">
          Les connexions passent d’abord par un serveur d’entrée, lui aussi exploité par l’éditeur, qui tient un
          journal d’accès. Le logiciel de sécurité CrowdSec y repère les comportements d’attaque et bloque pour
          quelques heures l’adresse IP qui les produit ; dans ce cas seulement, cette adresse, la nature de
          l’attaque et son heure sont transmises à son éditeur, la société française CrowdSec SAS. Rien n’est
          transmis pour une navigation ordinaire, et jamais le contenu d’une requête.
        </p>
      </LegalSection>

      {transfers ? (
        <LegalSection title="Transferts hors de l’Union européenne">
          <p>
            Certaines données peuvent être traitées aux États-Unis par Google LLC. Ces transferts reposent sur la
            décision d’adéquation de la Commission européenne du 10 juillet 2023 (cadre de protection des données
            UE - États-Unis, « Data Privacy Framework »), auquel cette société a adhéré.
          </p>
        </LegalSection>
      ) : null}

      <LegalSection title="Durées de conservation">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Sondages, avec leurs jours et leurs réponses : supprimés{' '}
            {duration(RETENTION.pollMonthsAfterLastDay, 'mois')} après leur dernier jour proposé.
          </li>
          <li>
            Comptes : après {duration(RETENTION.inactiveAccountYears, 'an')} sans activité, un email vous prévient ;
            sans connexion dans les {duration(RETENTION.deletionDaysAfterWarning, 'jour')} qui suivent, le compte
            est supprimé, avec ses sondages et ses réponses.
          </li>
          <li>
            Emails du service : retirés de la file d’envoi {duration(RETENTION.sentEmailDays, 'jour')} après leur
            mise en file, qu’ils soient partis ou non.
          </li>
          <li>
            Liens de réinitialisation du mot de passe : valables{' '}
            {secondsInWords(RETENTION.passwordResetMinutes * 60)}, puis supprimés.
          </li>
          <li>Compteurs anti-abus : {duration(RETENTION.rateLimitHitHours, 'heure')}.</li>
          <li>Journal d’accès du serveur d’entrée : {duration(PROXY_RETENTION.accessLogDays, 'jour')}.</li>
          <li>Adresses IP signalées par CrowdSec : {duration(PROXY_RETENTION.alertsDays, 'jour')} au plus.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Sécurité">
        <p>
          Le service n’est servi qu’en HTTPS. Les mots de passe sont hachés avec argon2id et ne sont jamais stockés en
          clair. Les sessions et les appareils sont reconnus par des jetons aléatoires dont seule l’empreinte est
          enregistrée.
        </p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation et d’opposition, ainsi que
          du droit à la portabilité de vos données. Depuis{' '}
          <Link href="/compte" className="text-[var(--color-ember)] underline underline-offset-4">
            votre compte
          </Link>
          , vous modifiez votre nom d’affichage et supprimez le compte, ce qui efface aussi vos sondages et vos
          réponses. Une réponse donnée sans compte se modifie ou se retire depuis l’appareil et le navigateur qui
          l’ont envoyée.
        </p>
        <p className="mt-3">
          Pour toute autre demande, écrivez à {contact}. Vous pouvez aussi définir des directives sur le sort de vos
          données après votre décès (article 85 de la loi Informatique et Libertés).
        </p>
        <p className="mt-3">
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la
          CNIL, 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 (
          <a
            className="text-[var(--color-ember)] underline underline-offset-4"
            href="https://www.cnil.fr/fr/plaintes"
            target="_blank"
            rel="noopener noreferrer"
          >
            www.cnil.fr
          </a>
          ).
        </p>
      </LegalSection>

      <LegalSection title="Cookies et stockage local">
        <p>
          Aucun traceur publicitaire ni de mesure d’audience. Ce qui est enregistré sur votre appareil se limite au
          fonctionnement du service, et n’appelle donc pas de consentement :
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>
            Cookie de session (<code>{SESSION.cookieName}</code>) : vous garde connecté. Déposé à la connexion, il
            expire après {secondsInWords(SESSION.maxAgeSeconds)} d’inactivité, à la déconnexion, et en tout cas{' '}
            {secondsInWords(SESSION.absoluteMaxAgeSeconds)} après la connexion.
          </li>
          <li>
            Cookie d’appareil (<code>{DEVICE.cookieName}</code>) : déposé quand vous répondez sans compte, pour que
            vous retrouviez et modifiiez votre réponse depuis ce navigateur. Il dure{' '}
            {secondsInWords(DEVICE.maxAgeSeconds)}.
          </li>
          <li>
            Cookie de connexion avec Google (<code>{GOOGLE_HANDSHAKE_COOKIE}</code>) : protège l’aller-retour vers
            la page de Google. Déposé seulement quand vous cliquez sur ce bouton, il dure au plus{' '}
            {secondsInWords(COOKIE_MAX_AGE_SECONDS)} et s’efface au retour.
          </li>
          <li>
            Préférence de thème (<code>{THEME_STORAGE_KEY}</code>, stockage local du navigateur) : retient le thème
            clair ou sombre que vous choisissez. Rien n’est écrit tant que vous n’avez pas cliqué sur le bouton, et
            cette préférence ne quitte jamais votre navigateur.
          </li>
        </ul>
      </LegalSection>
    </LegalPage>
  );
}
