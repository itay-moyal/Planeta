import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

export default function AuthPage() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from ?? '/'; // where to go after success

  const [mode, setMode] = useState(location.state?.mode ?? 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message); // already Hebrew
    } finally {
      setBusy(false);
    }
  }

  const isLogin = mode === 'login';
  return (
    <main>
      <h1>{isLogin ? 'התחברות' : 'הרשמה'}</h1>
      <form className="form" onSubmit={onSubmit}>
        <label>
          אימייל
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" required dir="ltr" />
        </label>
        <label>
          סיסמה
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={isLogin ? undefined : 8} maxLength={72} required dir="ltr" />
        </label>
        {!isLogin && <small>לפחות 8 תווים</small>}
        {error && <p className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'רגע...' : isLogin ? 'התחברות' : 'הרשמה'}
        </button>
      </form>
      <p>
        {isLogin ? 'אין לכם חשבון?' : 'כבר יש לכם חשבון?'}{' '}
        <button type="button" className="link-button" onClick={() => { setMode(isLogin ? 'signup' : 'login'); setError(''); }}>
          {isLogin ? 'הרשמה' : 'התחברות'}
        </button>
      </p>
    </main>
  );
}
