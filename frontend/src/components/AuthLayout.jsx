import BrandLogo from './BrandLogo.jsx';
import '../styles/login-page.css';

export default function AuthLayout({ children }) {
  return (
    <div className="auth-layout">
      <header className="auth-brand-panel">
        <div className="auth-brand">
          <BrandLogo className="auth-logo" />
          <div>
            <p className="auth-brand-name">Phoebe’s Crafts</p>
            <p className="auth-brand-label">Inventory management</p>
          </div>
        </div>
        <div className="auth-brand-story">
          <p className="auth-brand-headline">A little order. More room to create.</p>
          <p className="auth-brand-copy">Your materials, stock, and daily movements. Everything in its place.</p>
        </div>
      </header>
      <main className="auth-main" id="main-content">
        <div className="auth-content">{children}</div>
      </main>
    </div>
  );
}
