import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

// Supabase's password-recovery email links back to APP_URL + "/reset-password"
// with the session tokens in the URL fragment (never sent to any server as
// part of the path/query). We read them once on mount, then immediately
// strip the fragment from the address bar so it never lingers in browser
// history — the tokens themselves live only in component state until the
// reset request consumes them.
function readRecoveryTokensFromHash(): { accessToken: string; refreshToken: string } | null {
  const hash = window.location.hash;
  if (!hash || !hash.includes('type=recovery')) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken) return null;
  return { accessToken, refreshToken: refreshToken ?? '' };
}

export const AuthView: React.FC = () => {
  const { login, register, requestPasswordReset, resetPassword } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const tokens = readRecoveryTokensFromHash();
    if (tokens) {
      setRecoveryTokens(tokens);
      setMode('reset');
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const switchMode = (m: AuthMode) => {
    setMode(m);
    setError('');
    setSuccessMsg('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (mode === 'register') {
      if (!name.trim()) { setError('Please enter your name.'); return; }
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    }
    if (mode === 'reset') {
      if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        // AuthProvider sets user → App re-renders and shows main content
      } else if (mode === 'register') {
        await register(email.trim(), password, name.trim());
        setSuccessMsg('Account created! You can now sign in.');
        switchMode('login');
      } else if (mode === 'forgot') {
        await requestPasswordReset(email.trim());
        setSuccessMsg('If an account exists for that email, a password reset link has been sent.');
        switchMode('login');
      } else if (mode === 'reset' && recoveryTokens) {
        await resetPassword(recoveryTokens.accessToken, recoveryTokens.refreshToken, password);
        // AuthProvider sets user → App re-renders and shows main content
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const submitLabel = {
    login: isLoading ? 'Signing in…' : 'Sign In',
    register: isLoading ? 'Creating account…' : 'Create Account',
    forgot: isLoading ? 'Sending…' : 'Send Reset Link',
    reset: isLoading ? 'Saving…' : 'Set New Password',
  }[mode];

  return (
    <div className="min-h-screen bg-[#0f1e2b] flex flex-col items-center justify-center p-4">
      {/* Brand header */}
      <div className="mb-8 text-center">
        <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-3 shadow-xl overflow-hidden p-1.5">
          <img src="/logo-icon-192.png" alt="Mlo Wangu" className="w-full h-full object-contain rounded-xl" />
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Mlo Wangu</h1>
        <p className="text-sm text-blue-200 mt-1">Your Kenyan Meal & Budget Planner</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-[#172554] rounded-3xl shadow-2xl border border-[#1e3a8a] p-7">
        {(mode === 'login' || mode === 'register') && (
          <div className="flex bg-white/10 rounded-2xl p-1 mb-6">
            {(['login', 'register'] as AuthMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  mode === m
                    ? 'bg-[#F4B942] text-[#17201A] shadow'
                    : 'text-blue-200 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>
        )}

        {mode === 'forgot' && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="flex items-center gap-1 text-xs font-bold text-blue-200 hover:text-white cursor-pointer mb-3"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
            <h2 className="text-lg font-extrabold text-white">Reset your password</h2>
            <p className="text-xs text-blue-200 mt-1">Enter your email and we'll send you a reset link.</p>
          </div>
        )}

        {mode === 'reset' && (
          <div className="mb-6">
            <h2 className="text-lg font-extrabold text-white">Choose a new password</h2>
            <p className="text-xs text-blue-200 mt-1">You'll be signed in automatically once it's saved.</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-400/30 rounded-xl text-red-200 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-green-500/20 border border-green-400/30 rounded-xl text-green-200 text-xs flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold text-blue-200 mb-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="e.g. Amina Mwangi"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
                />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <div>
              <label className="block text-xs font-bold text-blue-200 mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
                />
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <label className="block text-xs font-bold text-blue-200 mb-1">
                {mode === 'reset' ? 'New Password' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300 hover:text-white cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div className="flex justify-end -mt-2">
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-[11px] font-bold text-blue-300 hover:text-white cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
          )}

          {(mode === 'register' || mode === 'reset') && (
            <div>
              <label className="block text-xs font-bold text-blue-200 mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-2xl text-sm text-white placeholder:text-blue-300/50 focus:outline-none focus:ring-2 focus:ring-[#F4B942]"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-[#F4B942] hover:bg-[#E5A72E] text-[#17201A] font-extrabold text-sm rounded-2xl transition-all shadow-md cursor-pointer disabled:opacity-50 mt-2"
          >
            {submitLabel}
          </button>
        </form>

        <p className="text-center text-[11px] text-blue-300/60 mt-6">
          Your financial data is private and encrypted.
        </p>
      </div>
    </div>
  );
};
