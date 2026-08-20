import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { AdminView } from '../AdminView';
import { ShieldAlert, Lock, Mail, Eye, EyeOff, AlertCircle, LogOut } from 'lucide-react';

// Entry point for /?admin=true. The query parameter only routes the browser
// here — it grants nothing. Every render path below either shows a login
// form, a denial screen, or the real admin UI, and which one is chosen is
// decided exclusively by server responses (401/403/200), never by the query
// string, localStorage, or any client-held flag.
type AuthzState = 'checking' | 'authorized' | 'denied';

const AdminLoginForm: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email.trim(), password);
      // On success, AuthContext flips isAuthenticated and AdminGate re-checks
      // authorization server-side — signing in here does not by itself grant
      // admin access.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1208] flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-3 shadow-xl overflow-hidden p-1.5">
          <img src="/logo-icon-192.png" alt="Mlo Wangu" className="w-full h-full object-contain rounded-xl" />
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">Mlo Wangu Admin</h1>
        <p className="text-sm text-amber-200/70 mt-1">Restricted administrator access</p>
      </div>

      <div className="w-full max-w-sm bg-[#231a0d] rounded-3xl shadow-2xl border border-[#3a2c14] p-7">
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-400/30 rounded-xl text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-amber-200/80 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-300/50" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-amber-200/30 focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-amber-200/80 mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-300/50" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-amber-200/30 focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-300/50 hover:text-white cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-sm rounded-2xl transition-all shadow-md cursor-pointer disabled:opacity-50 mt-2"
          >
            {isLoading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};

const AccessDenied: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <div className="min-h-screen bg-[#1a1208] flex flex-col items-center justify-center p-4 text-center">
    <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4 border border-red-400/30">
      <ShieldAlert className="w-9 h-9 text-red-300" />
    </div>
    <h1 className="text-xl font-extrabold text-white">Access Denied</h1>
    <p className="text-sm text-amber-200/60 mt-2 max-w-xs">
      This account does not have administrator privileges.
    </p>
    <button
      onClick={onLogout}
      className="mt-6 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
    >
      Sign Out
    </button>
  </div>
);

const VerifyingScreen: React.FC = () => (
  <div className="min-h-screen bg-[#1a1208] flex items-center justify-center">
    <div className="text-[#F4B942] text-lg font-extrabold animate-pulse">Verifying access…</div>
  </div>
);

export const AdminGate: React.FC = () => {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const [authzState, setAuthzState] = useState<AuthzState>('checking');

  // The only real authorization check: a live call to an admin-only endpoint
  // that the server independently re-verifies (requireAuth + requireAdmin)
  // on every request. A 401/403 here means denied, full stop — regardless of
  // what the query string or any prior client state says.
  const checkAuthorization = useCallback(async () => {
    setAuthzState('checking');
    try {
      await api.getAdminStats();
      setAuthzState('authorized');
    } catch {
      setAuthzState('denied');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      checkAuthorization();
    } else {
      setAuthzState('checking');
    }
  }, [isAuthenticated, checkAuthorization]);

  const handleLogout = async () => {
    await logout();
    setAuthzState('checking');
  };

  if (isLoading) return <VerifyingScreen />;
  if (!isAuthenticated) return <AdminLoginForm />;
  if (authzState === 'checking') return <VerifyingScreen />;
  if (authzState === 'denied') return <AccessDenied onLogout={handleLogout} />;

  return (
    <div className="min-h-screen bg-[#FAF8F2]">
      <header className="bg-[#17201A] px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <img src="/logo-icon-192.png" alt="Mlo Wangu" className="w-6 h-6 rounded-md" />
          <span className="font-extrabold text-sm">Mlo Wangu Admin</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-bold text-white/70 hover:text-white cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign Out
        </button>
      </header>
      <main className="max-w-6xl mx-auto p-4 sm:p-6 md:p-8">
        <AdminView />
      </main>
    </div>
  );
};
