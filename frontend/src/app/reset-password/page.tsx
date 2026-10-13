import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/reset-password-form";
import { vi } from "@/i18n/vi";

export const metadata: Metadata = { title: vi.auth.resetTitle, referrer: "no-referrer" };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
