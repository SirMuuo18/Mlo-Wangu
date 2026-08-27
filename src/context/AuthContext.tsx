import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  // Authoritative (profiles.onboarding_complete) — see App.tsx's AuthGate.
  // Optional only because it's absent until the first /api/auth/me resolves.
  onboardingComplete?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  // Resolves true if the reset also signed the user in (the common case);
  // false means the password was changed but the caller must sign in manually.
  resetPassword: (accessToken: string, password: string) => Promise<boolean>;
  // Re-fetches /api/auth/me to reconcile server-authoritative fields (e.g.
  // onboardingComplete right after POST /api/onboarding/complete succeeds).
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function apiCall(path: string, body?: object) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        // A 200 with no `user` field shouldn't happen (requireAuth would
        // 401 first), but if it ever does, treat it as "not signed in"
        // rather than fabricating a placeholder identity.
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiCall('/api/auth/login', { email, password });
    setUser(data.user ?? { id: data.userId, email });
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    await apiCall('/api/auth/register', { email, password, name });
  }, []);

  const logout = useCallback(async () => {
    try { await apiCall('/api/auth/logout'); } catch { /* ignore */ }
    setUser(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    await apiCall('/api/auth/request-password-reset', { email });
  }, []);

  const resetPassword = useCallback(async (accessToken: string, password: string) => {
    const data = await apiCall('/api/auth/reset-password', { accessToken, password });
    setUser(data.user ?? null);
    return !!data.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout, requestPasswordReset, resetPassword, refreshUser: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
};
