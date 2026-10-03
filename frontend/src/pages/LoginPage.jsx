import { useRef, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, ArrowRight } from 'lucide-react';
import { Navigate } from 'react-router';
import AuthLayout from '../components/AuthLayout.jsx';
import Skeleton from '../components/Skeleton.jsx';
import RateLimitNotice from '../components/RateLimitNotice.jsx';
import useRateLimit from '../hooks/useRateLimit.js';
import useAuth from '../hooks/useAuth.js';
import { getAuthError } from '../utils/authErrors.js';
import { validateLogin } from '../utils/validateLogin.js';
import { MAX_USERNAME_LENGTH, MAX_PASSWORD_BYTES } from '../../../shared/inputValidation.mjs';

const LoginPage = () => {
  const { admin, isChecking, sessionError, signIn } = useAuth();
  const { isRateLimited } = useRateLimit('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [requestError, setRequestError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const errorRef = useRef(null);
  const submittingRef = useRef(false);

  if (admin) return <Navigate to="/" replace />;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || isChecking || isRateLimited) return;
    const errors = validateLogin({ username, password });
    setFieldErrors(errors);
    setRequestError('');
    if (Object.keys(errors).length) {
      (errors.username ? usernameRef : passwordRef).current.focus();
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await signIn({ username: username.trim(), password });
    } catch (error) {
      setRequestError(getAuthError(error, { offline: !navigator.onLine }));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <p className="auth-eyebrow">Admin access</p>
      <h1 className="auth-title">Welcome back.</h1>
      <p className="auth-description">Sign in to manage your inventory.</p>
      {isChecking && <div className="auth-session-skeleton" role="status"><span className="visually-hidden">Checking your session…</span><Skeleton /></div>}
      <RateLimitNotice scope="login" />

      <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
        <div className="auth-field">
          <label htmlFor="username">Username</label>
          <input
            ref={usernameRef}
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={MAX_USERNAME_LENGTH}
            value={username}
            disabled={isSubmitting}
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? 'username-error' : undefined}
            onChange={(event) => {
              setUsername(event.target.value);
              setFieldErrors((errors) => ({ ...errors, username: undefined }));
              setRequestError('');
            }}
          />
          {fieldErrors.username && <p className="auth-field-error" id="username-error">{fieldErrors.username}</p>}
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <div className="auth-password-field">
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              maxLength={MAX_PASSWORD_BYTES}
              value={password}
              disabled={isSubmitting}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setFieldErrors((errors) => ({ ...errors, password: undefined }));
                setRequestError('');
              }}
            />
            <button
              type="button"
              className="auth-password-toggle"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-controls="password"
              disabled={isSubmitting}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          </div>
          {fieldErrors.password && <p className="auth-field-error" id="password-error">{fieldErrors.password}</p>}
        </div>

        <div className="auth-feedback" aria-live="polite" aria-atomic="true">
          {requestError ? (
            <p className="auth-request-error" ref={errorRef} tabIndex={-1}>{requestError}</p>
          ) : sessionError ? <p className="auth-session-note">{sessionError}</p> : null}
        </div>

        <button className="auth-submit" type="submit" disabled={isChecking || isSubmitting || isRateLimited}>
          <span>{isChecking ? 'Checking session…' : isSubmitting ? 'Signing in…' : 'Sign in'}</span>
          {!isChecking && !isSubmitting && <ArrowRight size={19} aria-hidden="true" />}
        </button>
        <span className="visually-hidden" role="status">{isSubmitting ? 'Signing in. Please wait.' : ''}</span>
      </form>

      <p className="auth-access-note"><LockKeyhole size={15} aria-hidden="true" /> Authorized access only.</p>
    </AuthLayout>
  );
};

export default LoginPage;
