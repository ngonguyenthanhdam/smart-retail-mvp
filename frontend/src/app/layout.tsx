import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AuthBoundary } from '@/components/auth-boundary';
import { AuthProvider } from '@/components/auth-provider';
import { LocaleProvider } from '@/i18n/provider';
import { getLocale, getServerMessages } from '@/i18n/server';

import './globals.css';
import './retail-system.css';
import './design-tokens.css';
import './dashboard-shell.css';
import './catalog-design.css';
import './workspace-design.css';

export async function generateMetadata(): Promise<Metadata> {
  const { vi } = await getServerMessages();
  return {
    title: { default: vi.brand, template: `%s | ${vi.brand}` },
    description: vi.description,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="retail-ui">
        <LocaleProvider initialLocale={locale}>
          <AuthProvider>
            <AuthBoundary>{children}</AuthBoundary>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
