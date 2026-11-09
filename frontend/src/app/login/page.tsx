import { LoginForm } from '@/components/login-form';
import { getServerMessages } from '@/i18n/server';

export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.auth.signIn };
}

export default function LoginPage() {
  return <LoginForm />;
}
