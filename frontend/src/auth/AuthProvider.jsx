import { useCallback, useEffect, useState } from 'react';
import { getCurrentAdmin, loginAdmin, logoutAdmin } from '../services/authApi.js';
import AuthContext from './AuthContext.js';

export default function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [isChecking, setIsChecking] = useState(true);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const restoreSession = async () => {
      try {
        const currentAdmin = await getCurrentAdmin(controller.signal);
        if (!controller.signal.aborted) setAdmin(currentAdmin);
      } catch (error) {
        if (!controller.signal.aborted && error.response?.status !== 401) {
          setSessionError("Couldn't check your session. Try signing in below.");
        }
      } finally {
        if (!controller.signal.aborted) setIsChecking(false);
      }
    };
    restoreSession();
    return () => controller.abort();
  }, []);

  const signIn = async (credentials) => {
    const currentAdmin = await loginAdmin(credentials);
    setAdmin(currentAdmin);
    setSessionError('');
  };

  const signOut = async () => {
    await logoutAdmin();
    setAdmin(null);
    setSessionError('');
  };

  const expireSession = useCallback(() => {
    setAdmin(null);
    setSessionError('Your session has expired. Please sign in again.');
  }, []);

  return (
    <AuthContext.Provider value={{ admin, isChecking, sessionError, signIn, signOut, expireSession }}>
      {children}
    </AuthContext.Provider>
  );
}
