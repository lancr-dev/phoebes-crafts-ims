import '../styles/skeleton.css';

export default function Skeleton({ className = '' }) {
  return <span className={`skeleton ${className}`.trim()} aria-hidden="true" />;
}
