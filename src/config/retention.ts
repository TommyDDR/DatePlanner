/**
 * Durées de conservation des données personnelles (constitution IV).
 *
 * Déclarées UNE seule fois : la maintenance les applique, la politique de
 * confidentialité les annonce, et un test confronte les deux. Une durée
 * annoncée qui ne serait pas celle appliquée serait une promesse fausse.
 */
export const RETENTION = {
  /** Un sondage est supprimé ce nombre de mois après son dernier jour proposé. */
  pollMonthsAfterLastDay: 12,
  /** Un compte sans activité depuis ce nombre d'années reçoit un avertissement. */
  inactiveAccountYears: 3,
  /** Il est supprimé ce nombre de jours après l'avertissement, sauf activité. */
  deletionDaysAfterWarning: 30,
  /** Les emails partis, annulés ou en échec sont purgés de la file après ce nombre de jours. */
  sentEmailDays: 30,
  /** Un lien de réinitialisation du mot de passe vaut ce nombre de minutes. */
  passwordResetMinutes: 60,
  /** Une trace anti-flood est purgée au-delà de ce nombre d'heures. */
  rateLimitHitHours: 24,
} as const;

/**
 * Durées du serveur d'entrée, le conteneur proxy partagé avec laserit.fr.
 *
 * Ce dépôt ne les applique pas : la rotation du journal de Traefik et CrowdSec
 * sont réglés par les fichiers `deploy/` de laserit.fr, qui les vérifient. La
 * politique de confidentialité les annonce parce que chaque requête vers
 * DatePlanner y passe.
 */
export const PROXY_RETENTION = {
  /** Journal d'accès de Traefik : adresse IP, date, page demandée, réponse. */
  accessLogDays: 14,
  /** Alertes de CrowdSec, avec l'adresse qui les a déclenchées. */
  alertsDays: 7,
} as const;
