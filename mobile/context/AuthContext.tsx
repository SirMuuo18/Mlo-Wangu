// Mobile equivalent of src/context/AuthContext.tsx — same responsibility
// (who is signed in, is onboarding done), different transport: a Supabase
// session + Bearer token instead of an HttpOnly cookie. Session
// verification, profile data, and onboarding state all still come from the
// real server (GET /api/auth/me) — this file does not duplicate any of
// that; it only tracks client-side navigation state (which screen to show).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api, ApiError } from '../lib/api';
import { clearFinancialToken } from '../lib/financialSession';
import { registerForPushNotifications, unregisterPushNotifications } from '../lib/push';
import type { AuthUser } from '../types/auth';

export type AuthStatus = 'restoring' | 'unauthenticated' | 'authenticated';

interface AuthContextType {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  // Re-fetches /api/auth/me — call after anything that changes server-side
  // profile state (e.g. completing onboarding) so `user` stays in sync.
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Turns a raw Supabase Auth error into the same generic, non-account-
// revealing message the web app already shows (server.ts's /api/auth/login
// never says which of email/password was wrong either).
function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(message)) return 'Invalid email or password.';
  if (/email not confirmed/i.test(message)) return 'Please confirm your email before signing in.';
  return 'Sign-in failed. Please try again.';
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<AuthUser | null>(null);
  // Guards against a stale in-flight profile fetch resolving after logout()
  // has already reset state (e.g. a slow /api/auth/me racing a sign-out).
  const requestId = useRef(0);

  const loadProfile = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const { user: profile } = await api.getMe();
      if (id !== requestId.current) return;
      setUser(profile);
      setStatus('authenticated');
      // Best-effort, never blocks reaching 'authenticated' — a push-
      // registration failure (or no EAS project configured yet) must never
      // prevent the app from opening.
      registerForPushNotifications().catch(() => {});
    } catch (err) {
      if (id !== requestId.current) return;
      // A Supabase session exists but the server rejected it (e.g. the
      // account was deleted, or the token is invalid) — treat as signed out
      // rather than getting stuck on a broken "authenticated" state with no
      // profile.
      console.error('[auth] failed to load profile:', err instanceof ApiError ? err.message : err);
      setUser(null);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        loadProfile();
      } else {
        setStatus('unauthenticated');
      }
    });

    // Keeps `user`/`status` correct across sign-in from the login screen,
    // a background token refresh, and a sign-out triggered from anywhere
    // (including logout() below, which also calls this indirectly).
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        requestId.current++; // invalidate any in-flight loadProfile
        setUser(null);
        setStatus('unauthenticated');
      } else if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        loadProfile();
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyAuthError(error));
    await loadProfile();
  }, [loadProfile]);

  // Registration itself never creates a session (matches the web app: the
  // Express route only creates the account) — sign in immediately after,
  // exactly like a user would manually do on web after registering.
  const register = useCallback(async (email: string, password: string, name: string) => {
    try {
      await api.register(email, password, name);
    } catch (err) {
      if (err instanceof ApiError) throw new Error(err.message);
      throw err;
    }
    await login(email, password);
  }, [login]);

  const logout = useCallback(async () => {
    // Must happen before signOut() below — unregistering needs a still-valid
    // Bearer token to authenticate to our own API. Best-effort: a failure
    // here must never block the rest of logout (see unregisterPushNotifications).
    await unregisterPushNotifications().catch(() => {});
    // Global-scope sign-out (the SDK default) revokes the refresh token
    // server-side too — this IS the security-relevant action. The Express
    // /api/auth/logout endpoint is deliberately not called here: it only
    // ever reads the web cookie, never the Authorization header, so it
    // would be a no-op for this client (see the Expo Readiness Audit,
    // Section 06).
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Even if the network call fails, still drop local state below —
      // never leave the previous user's session looking active on-device.
      console.error('[auth] signOut request failed (clearing local session anyway):', err);
    }
    await clearFinancialToken();
    requestId.current++;
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, register, logout, refreshUser: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
