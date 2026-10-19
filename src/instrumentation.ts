import type { Instrumentation } from 'next';

/**
 * Chaque erreur serveur que Next capte - rendu, route, Server Action - est
 * SIGNALÉE au journal par une ligne que la supervision compte
 * (`server/monitoring/server-errors.ts`, deploy/supervision/). Rien de
 * l'erreur n'est gardé ici : Next l'a déjà écrite dans le journal du serveur.
 *
 * Dans le seul processus Node : le runtime Edge n'écrit pas dans journald.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { isReportableError, logServerError } = await import('@/server/monitoring/server-errors');
  if (isReportableError(error)) logServerError(error, context);
};
