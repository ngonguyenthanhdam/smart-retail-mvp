import { UsersPage } from '@/components/users-page';
import { getServerMessages } from '@/i18n/server';

export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.users.title };
}
export default function Page() {
  return <UsersPage />;
}
