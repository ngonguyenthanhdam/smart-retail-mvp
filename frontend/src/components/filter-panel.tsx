'use client';
import { useScreen } from '@/i18n/provider';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

export function FilterPanel({ children }: { children: ReactNode }) {
  const { t } = usePageCopy();
  const id = useId();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <div
      className="filter-disclosure"
      onSubmitCapture={() => {
        if (window.matchMedia('(max-width: 639px)').matches) {
          setOpen(false);
          toggle.current?.focus();
        }
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="filter-disclosure-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
        <span>{t.filters}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div id={id} className="filter-disclosure-fields" data-open={open}>
        {children}
      </div>
    </div>
  );
}

function usePageCopy() {
  const t = useScreen('filter_panel');

  return { t };
}
