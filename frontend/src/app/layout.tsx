import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AuthBoundary } from "@/components/auth-boundary";
import { AuthProvider } from "@/components/auth-provider";
import { vi } from "@/i18n/vi";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: vi.brand, template: `%s | ${vi.brand}` },
  description: vi.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={vi.locale}>
      <body>
        <AuthProvider>
          <AuthBoundary>{children}</AuthBoundary>
        </AuthProvider>
      </body>
    </html>
  );
}
