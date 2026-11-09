'use client';
import { useMessages } from '@/i18n/provider';
import Link from 'next/link';

export default function NotFound() {
  const { vi } = usePageCopy();
  return (
    <div className="not-found">
      <p className="eyebrow">404</p>
      <h1>{vi.notFound.title}</h1>
      <p className="page-description">{vi.notFound.description}</p>
      <Link className="primary-link" href="/dashboard">
        {vi.notFound.back}
      </Link>
    </div>
  );
}

function usePageCopy() {
  const { vi } = useMessages();

  return { vi };
}
