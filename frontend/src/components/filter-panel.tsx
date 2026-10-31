'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';

/** Keep filters visible on desktop and leave room for records on small screens. */
export function FilterPanel({ children }: { children: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return <div className="filter-disclosure" onSubmitCapture={() => {
    if (window.matchMedia('(max-width: 639px)').matches) {
      setOpen(false);
      toggle.current?.focus();
    }
  }}>
    <button ref={toggle} type="button" className="filter-disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <SlidersHorizontal size={17} aria-hidden="true" /><span>Bộ lọc</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    <div id={id} className="filter-disclosure-fields" data-open={open}>{children}</div>
  </div>;
}
