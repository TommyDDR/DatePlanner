import { notFound, redirect } from 'next/navigation';
import { USERS_PATH } from '@/lib/admin-query';
import { getAdminUser } from '@/server/admin/access';

/** L'entrée de l'administration mène à son premier écran ; à qui n'est pas administrateur, elle n'existe pas. */
export default async function AdminPage() {
  if (!(await getAdminUser())) notFound();
  redirect(USERS_PATH);
}
