import { ResetPasswordForm } from '@/components/reset-password-form';
import { getServerMessages } from '@/i18n/server';

export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.auth.resetTitle, referrer: 'no-referrer' };
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
