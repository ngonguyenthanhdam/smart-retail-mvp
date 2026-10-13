import type { Metadata } from "next";

import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { vi } from "@/i18n/vi";

export const metadata: Metadata = { title: vi.auth.forgotTitle };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
