import { Navigate, Outlet } from 'react-router';
import useAuth from '../hooks/useAuth.js';
import AuthLayout from './AuthLayout.jsx';

export default function ProtectedRoute() {
  const { admin, isChecking } = useAuth();
  if (isChecking) {
    return (
      <AuthLayout>
        <h1 className="auth-title">Welcome back.</h1>
        <p className="auth-description" role="status">Checking your session…</p>
      </AuthLayout>
    );
  }
  return admin ? <Outlet /> : <Navigate to="/login" replace />;
}
