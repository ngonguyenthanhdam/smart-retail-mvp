'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { getMessages } from './messages';
import { screens } from './screens';
import { localeCookie, type Locale } from './types';
import { withFallback } from './fallback';

const localizedScreens = Object.fromEntries(
  Object.entries(screens).map(([key, copy]) => [
    key,
    {
      vi: copy.vi,
      en: withFallback(copy.vi, copy.en),
    },
  ]),
) as typeof screens;

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void } | null>(
  null,
);

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const pathname = usePathname();
  function setLocale(next: Locale) {
    updateLocale(next);
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
  useEffect(() => {
    const { vi } = getMessages(locale);
    document.documentElement.lang = locale;
    document.querySelector('meta[name="description"]')?.setAttribute('content', vi.description);
    const titles: Record<string, string> = {
      '/login': vi.auth.signIn,
      '/forgot-password': vi.auth.forgotTitle,
      '/reset-password': vi.auth.resetTitle,
      '/products/categories': vi.catalog.categories,
      '/products/units': vi.catalog.units,
      '/products/store-settings': vi.catalog.storeProducts,
      ...Object.fromEntries(
        Object.entries(vi.sections).map(([key, value]) => [`/${key}`, value.label]),
      ),
    };
    document.title = `${titles[pathname] ?? vi.notFound.title} | ${vi.brand}`;
  }, [locale, pathname]);
  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('LocaleProvider is required');
  return context;
}
export function useMessages() {
  return getMessages(useLocale().locale);
}
export function useScreen<N extends keyof typeof screens>(name: N): (typeof screens)[N][Locale] {
  return localizedScreens[name][useLocale().locale] as (typeof screens)[N][Locale];
}
