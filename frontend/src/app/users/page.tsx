import type { Metadata } from 'next';
import { UsersPage } from '@/components/users-page';
import { vi } from '@/i18n/vi';

export const metadata: Metadata = { title: vi.users.title };
export default function Page() { return <UsersPage />; }
