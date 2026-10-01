import { Menu } from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import '../styles/navbar.css';

const Navbar = ({ username, onOpenNavigation, isNavigationOpen = false, navigationId }) => {
  return (
    <header className="app-navbar">
      <div className="navbar-leading">
        <button className="navbar-menu-button" type="button" onClick={onOpenNavigation} aria-label="Open navigation menu"
          aria-expanded={isNavigationOpen} aria-controls={navigationId} aria-haspopup="dialog">
          <Menu size={22} aria-hidden="true" />
        </button>
        <p className="navbar-workspace-label">Inventory workspace</p>
      </div>
      <div className="navbar-account">
        <BrandLogo className="navbar-avatar" />
        <div className="navbar-account-details">
          <span className="navbar-account-role">Administrator</span>
          <span className="navbar-account-name" title={username}>{username}</span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
