import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";
import { vi } from "@/i18n/vi";

export const metadata: Metadata = { title: vi.auth.signIn };

export default function LoginPage() {
  return <LoginForm />;
}
