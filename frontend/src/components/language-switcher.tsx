'use client';

import { Languages } from 'lucide-react';
import { useLocale } from '@/i18n/provider';

export function LanguageSwitcher({ standalone = false }: { standalone?: boolean }) {
  const { locale, setLocale } = useLocale();
  return (
    <div
      className={`language-switcher${standalone ? ' language-switcher-standalone' : ''}`}
      role="group"
      aria-label={locale === 'vi' ? 'Ngôn ngữ giao diện' : 'Interface language'}
    >
      <Languages size={16} aria-hidden="true" />
      <button
        type="button"
        lang="vi"
        aria-label="Tiếng Việt"
        aria-pressed={locale === 'vi'}
        onClick={() => setLocale('vi')}
      >
        VI
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        lang="en"
        aria-label="English"
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        EN
      </button>
    </div>
  );
}
