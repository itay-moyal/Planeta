import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/');
  }

  return (
    <nav className="nav">
      <Link to="/" className="brand">Planeta 🌿</Link>
      <div className="nav-links">
        {user ? (
          <button type="button" className="link-button" onClick={onLogout}>התנתקות</button>
        ) : (
          <Link to="/login">התחברות</Link>
        )}
      </div>
    </nav>
  );
}
