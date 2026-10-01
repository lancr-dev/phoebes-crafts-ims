import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import RateLimitNotice from './RateLimitNotice.jsx';
import '../styles/inventory-modal.css';

export default function Modal({ title, titleId, onClose, isPending, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    dialog.querySelector('input:not([disabled])')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus();
      else document.getElementById('main-content')?.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className="inventory-dialog" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (!isPending) onClose(); }}>
      <header className="inventory-dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button className="inventory-icon-button" type="button" onClick={onClose} disabled={isPending} aria-label="Close dialog">
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <RateLimitNotice />
      {children}
    </dialog>
  );
}
