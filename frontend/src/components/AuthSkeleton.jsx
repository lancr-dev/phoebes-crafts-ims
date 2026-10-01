import Skeleton from './Skeleton.jsx';

export default function AuthSkeleton() {
  return (
    <div className="auth-skeleton" aria-busy="true">
      <p className="auth-description" role="status">Checking your session…</p>
      <div className="auth-skeleton-fields" aria-hidden="true">
        {[0, 1].map((field) => (
          <div className="auth-skeleton-field" key={field}>
            <Skeleton className="skeleton-field-label" />
            <Skeleton className="skeleton-input" />
          </div>
        ))}
        <Skeleton className="skeleton-input" />
      </div>
    </div>
  );
}
