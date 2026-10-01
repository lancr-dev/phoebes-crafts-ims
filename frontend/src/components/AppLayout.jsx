import { useRef, useState } from 'react';
import { Outlet } from 'react-router';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar.jsx';
import Navbar from './Navbar.jsx';
import RateLimitNotice from './RateLimitNotice.jsx';
import useRateLimit from '../hooks/useRateLimit.js';
import useAuth from '../hooks/useAuth.js';
import { getAuthError } from '../utils/authErrors.js';
import '../styles/app-layout.css';

export default function AppLayout() {
  const { admin, signOut } = useAuth();
  const { isRateLimited } = useRateLimit();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const signingOutRef = useRef(false);

  const handleSignOut = async () => {
    if (signingOutRef.current || isRateLimited) return;
    signingOutRef.current = true;
    setIsSigningOut(true);
    try {
      await signOut();
      toast.success('Signed out successfully.', { id: 'sign-out' });
    } catch (error) {
      toast.error(getAuthError(error, { action: 'sign out', offline: !navigator.onLine }), { id: 'sign-out' });
    } finally {
      signingOutRef.current = false;
      setIsSigningOut(false);
    }
  };

  return (
    <div className="app-shell">
      <a className="app-skip-link" href="#main-content">Skip to main content</a>
      <Sidebar onSignOut={handleSignOut} isSigningOut={isSigningOut} isSignOutDisabled={isRateLimited} />
      <div className="app-workspace">
        <Navbar username={admin.username} />
        <main className="app-main" id="main-content" tabIndex={-1}>
          <RateLimitNotice />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
