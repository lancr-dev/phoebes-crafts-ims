import BrandLogo from './BrandLogo.jsx';
import '../styles/navbar.css';

const Navbar = ({ username }) => {
  return (
    <header className="app-navbar">
      <p className="navbar-workspace-label">Inventory workspace</p>
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
