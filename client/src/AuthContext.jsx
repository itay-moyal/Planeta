import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until we know if a session cookie exists

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null)) // 401 simply means "not logged in"
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api('/api/auth/login', { method: 'POST', json: { email, password } });
    setUser(data.user);
  }

  async function signup(email, password) {
    // New accounts start with the browser's timezone; the user can change it later in settings.
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const data = await api('/api/auth/signup', { method: 'POST', json: { email, password, timezone } });
    setUser(data.user);
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
