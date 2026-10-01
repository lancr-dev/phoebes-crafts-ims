import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import Sidebar from './Sidebar.jsx';
import '../styles/mobile-navigation.css';

export default function MobileNavigation({ id, isOpen, onClose, onSignOut, isSigningOut, isSignOutDisabled, signOutError }) {
  const dialogRef = useRef(null);
  const focusMainRef = useRef(false);
  const location = useLocation();
  const previousLocationRef = useRef(location.key);

  useEffect(() => {
    if (!isOpen) return;
    const desktop = window.matchMedia('(min-width: 64rem)');
    if (desktop.matches) { onClose(); return; }

    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    focusMainRef.current = false;
    dialog.showModal();
    dialog.querySelector('.sidebar-close-button')?.focus();
    document.body.style.overflow = 'hidden';
    const closeOnDesktop = (event) => {
      if (event.matches) { focusMainRef.current = true; onClose(); }
    };
    desktop.addEventListener('change', closeOnDesktop);

    return () => {
      desktop.removeEventListener('change', closeOnDesktop);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (!focusMainRef.current && previousFocus?.isConnected && !previousFocus.disabled && previousFocus.getClientRects().length) {
        previousFocus.focus();
      } else document.getElementById('main-content')?.focus();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (previousLocationRef.current !== location.key) {
      previousLocationRef.current = location.key;
      if (isOpen) { focusMainRef.current = true; onClose(); }
    }
  }, [location.key, isOpen, onClose]);

  const closeAfterNavigation = () => {
    focusMainRef.current = true;
    onClose();
  };

  const closeOnBackdrop = (event) => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom) onClose();
  };

  return (
    <dialog ref={dialogRef} id={id} className="mobile-navigation" aria-label="Navigation menu" aria-modal="true"
      onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} onClick={closeOnBackdrop}>
      <Sidebar isMobile onClose={onClose} onNavigate={closeAfterNavigation} onSignOut={onSignOut}
        isSigningOut={isSigningOut} isSignOutDisabled={isSignOutDisabled} signOutError={signOutError} />
    </dialog>
  );
}
