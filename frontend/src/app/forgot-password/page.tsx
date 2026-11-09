import { ForgotPasswordForm } from '@/components/forgot-password-form';
import { getServerMessages } from '@/i18n/server';

export async function generateMetadata() {
  const { vi } = await getServerMessages();
  return { title: vi.auth.forgotTitle };
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
