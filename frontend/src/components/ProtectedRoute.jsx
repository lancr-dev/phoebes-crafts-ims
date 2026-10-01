import { Navigate, Outlet } from 'react-router';
import useAuth from '../hooks/useAuth.js';
import AuthLayout from './AuthLayout.jsx';
import AuthSkeleton from './AuthSkeleton.jsx';

export default function ProtectedRoute() {
  const { admin, isChecking } = useAuth();
  if (isChecking) {
    return (
      <AuthLayout>
        <h1 className="auth-title">Welcome back.</h1>
        <AuthSkeleton />
      </AuthLayout>
    );
  }
  return admin ? <Outlet /> : <Navigate to="/login" replace />;
}
