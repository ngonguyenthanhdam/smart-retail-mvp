'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { LanguageSwitcher } from './language-switcher';

export function AdminDialog({
  titleId,
  busy = false,
  onClose,
  children,
}: {
  titleId: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="admin-dialog"
      aria-labelledby={titleId}
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="dialog-language">
        <LanguageSwitcher />
      </div>
      {children}
    </dialog>
  );
}
