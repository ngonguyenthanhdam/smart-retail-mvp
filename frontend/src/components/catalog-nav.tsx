'use client';
import { useMessages } from '@/i18n/provider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';

export function CatalogNav() {
  const { vi } = usePageCopy();
  const { user } = useAuth();
  const path = usePathname();
  const links = [
    { href: '/products', label: vi.catalog.products },
    ...(user?.role === 'ADMIN'
      ? [
          { href: '/products/store-settings', label: vi.catalog.storeProducts },
          { href: '/products/categories', label: vi.catalog.categories },
          { href: '/products/units', label: vi.catalog.units },
        ]
      : []),
  ];
  return (
    <nav className="catalog-nav" aria-label={vi.catalog.navigation}>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="secondary-button"
          aria-current={path === href ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function usePageCopy() {
  const { vi } = useMessages();

  return { vi };
}
