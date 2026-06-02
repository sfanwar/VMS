import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  authApi, userApi, setAccessToken, setRefreshToken, getRefreshToken,
  UserProfile,
} from './api';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPersona: (...codes: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // On first load: if we have a refresh token, try to hydrate user
  useEffect(() => {
    (async () => {
      try {
        if (getRefreshToken()) {
          const me = await userApi.me();
          setUser(me);
        }
      } catch {
        // Token invalid — wipe and require login
        setAccessToken(null);
        setRefreshToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    setAccessToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    setUser(res.user);
  };

  const logout = async () => {
    const rt = getRefreshToken();
    if (rt) {
      try { await authApi.logout(rt); } catch { /* ignore */ }
    }
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  };

  const hasPersona = (...codes: string[]) =>
    !!user && codes.some((c) => user.personas.some((p) => p.code === c));

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPersona }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
