import '../styles/navbar.css';

const Navbar = ({ username }) => {
  return (
    <header className="app-navbar">
      <p className="navbar-workspace-label">Inventory workspace</p>
      <div className="navbar-account">
        <span className="navbar-avatar" aria-hidden="true">{[...username][0]?.toUpperCase()}</span>
        <div className="navbar-account-details">
          <span className="navbar-account-role">Administrator</span>
          <span className="navbar-account-name" title={username}>{username}</span>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
