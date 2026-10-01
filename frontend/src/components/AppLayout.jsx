import { useCallback, useId, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import MobileNavigation from './MobileNavigation.jsx';
import RateLimitNotice from './RateLimitNotice.jsx';
import useRateLimit from '../hooks/useRateLimit.js';
import useAuth from '../hooks/useAuth.js';
import { getAuthError } from '../utils/authErrors.js';
import '../styles/app-layout.css';

export default function AppLayout() {
  const { admin, signOut } = useAuth();
  const { isRateLimited } = useRateLimit();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const navigationId = useId();
  const closeNavigation = useCallback(() => setIsNavigationOpen(false), []);
  const signingOutRef = useRef(false);

  const handleSignOut = async () => {
    if (signingOutRef.current || isRateLimited) return;
    signingOutRef.current = true;
    setIsSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
      toast.success('Signed out successfully.', { id: 'sign-out' });
    } catch (error) {
      const message = getAuthError(error, { action: 'sign out', offline: !navigator.onLine });
      setSignOutError(message);
      toast.error(message, { id: 'sign-out' });
    } finally {
      signingOutRef.current = false;
      setIsSigningOut(false);
    }
  };

  return (
    <div className="app-shell">
      <a className="app-skip-link" href="#main-content">Skip to main content</a>
      <Sidebar onSignOut={handleSignOut} isSigningOut={isSigningOut} isSignOutDisabled={isRateLimited} signOutError={signOutError} />
      <div className="app-workspace">
        <Navbar username={admin.username} onOpenNavigation={() => setIsNavigationOpen(true)}
          isNavigationOpen={isNavigationOpen} navigationId={navigationId} />
        <main className="app-main" id="main-content" tabIndex={-1}>
          <RateLimitNotice />
          <Outlet />
        </main>
      </div>
      <MobileNavigation id={navigationId} isOpen={isNavigationOpen} onClose={closeNavigation}
        onSignOut={handleSignOut} isSigningOut={isSigningOut} isSignOutDisabled={isRateLimited} signOutError={signOutError} />
    </div>
  );
}
