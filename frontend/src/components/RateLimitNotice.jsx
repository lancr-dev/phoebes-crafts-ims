import { Timer } from 'lucide-react';
import useRateLimit from '../hooks/useRateLimit.js';
import '../styles/rate-limit-notice.css';

export default function RateLimitNotice({ scope = 'api' }) {
  const cooldown = useRateLimit(scope);
  if (!cooldown.isRateLimited) return null;
  const remaining = `${Math.floor(cooldown.seconds / 60)}:${String(cooldown.seconds % 60).padStart(2, '0')}`;

  return (
    <aside className="rate-limit-notice" aria-label="Request cooldown">
      <Timer size={20} aria-hidden="true" />
      <div className="rate-limit-message">
        <p role="status">{cooldown.scope === 'login' ? 'Sign-in attempts paused.' : 'Requests temporarily paused.'}</p>
        <p>Please try again when the timer finishes.</p>
      </div>
      <p className="rate-limit-countdown" role="timer" aria-live="off" aria-label={`Try again in ${cooldown.seconds} seconds`}>
        {remaining}
      </p>
    </aside>
  );
}
