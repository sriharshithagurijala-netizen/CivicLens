
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

const AuthContext = createContext(null);
const API = 'http://localhost:5000/api';
const TOKEN_KEY = 'civiclens_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY)
  );
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setLoading(false);
  }, []);

  const saveSession = useCallback((data) => {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          sessionStorage.removeItem(TOKEN_KEY);
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) setUser(data.user);
      } catch {
        // Preserve the token during temporary network failures.
        // The user can retry when the API is reachable.
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const authenticate = useCallback(async (mode, values) => {
    const endpoint = mode === 'register' ? 'register' : 'login';

    const response = await fetch(`${API}/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Authentication failed');
    }

    if (!data.token || !data.user) {
      throw new Error(
        'The API response is missing the token or user details. Check the auth route.'
      );
    }

    saveSession(data);
    return data.user;
  }, [saveSession]);

  const value = {
    user,
    token,
    loading,
    login: (values) => authenticate('login', values),
    register: (values) => authenticate('register', values),
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
