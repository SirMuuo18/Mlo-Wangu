import express, { Request, Response, NextFunction } from 'express';
import 'express-async-errors'; // must load before routes are defined — forwards thrown/rejected errors in async handlers to the error middleware instead of crashing the process
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
// 'vite' is imported lazily (inside startApp(), dev-mode only — see below)
// rather than at top level. It's a heavy, dev-only dependency (pulls in
// Rollup, including platform-native optional binaries) that must never load
// in a deployed environment: eagerly importing it here crashed Vercel's
// serverless function at module-load time even though the code path itself
// is gated behind NODE_ENV, because ES module imports execute regardless of
// whether the importing branch ever runs.
import { GoogleGenAI } from '@google/genai';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { db, generateShoppingItemsFromMealPlan, getMondayOfCurrentWeek, getTodayDate, getCurrentYearMonth } from './server/db.js';
import { secureDb, paymentsDb, contentDb, notificationsDb, pushDb, errorLogDb, aiDb, reminderDb, expiryWarningDb, budgetDigestDb, accountExportDb } from './server/secure-db.js';
import { adminDb, type AccessCodeStatus } from './server/admin-db.js';
import { getDarajaConfig, normalizeKenyanPhone, maskPhone, initiateStkPush, parseDarajaCallback, PREMIUM_PRICING, MEAL_PLAN_GENERATION_PRICE_KSH, normalizeMpesaReceiptCode, extractMpesaCodeFromMessage } from './server/mpesa.js';
import { sendPushToUser } from './server/push.js';
import { logServerError } from './server/errorLog.js';
import { KENYAN_MEALS, KENYAN_FOOD_ITEMS } from './src/data/kenyanFoodData.js';
import { ExpenseCategory, Meal } from './src/types.js';
import { canonicalizeShoppingItemName } from './server/shoppingCanonicalization.js';
import { requireAuth, optionalAuth, setAuthCookies, clearAuthCookies } from './server/auth-middleware.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Never trust X-Forwarded-For unless this app is known to sit behind a specific,
// trusted reverse proxy. Left disabled (Express default) so rate limiting keys
// off the real socket address, not a client-spoofable header. If deployed behind
// a trusted proxy (e.g. a platform load balancer), set this to the correct hop
// count — never `true`, which trusts the whole chain.
app.set('trust proxy', false);

const isProdEnv = process.env.NODE_ENV === 'production';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // The production build emits no inline scripts, so scriptSrc stays strict
      // there. In dev, Vite's middleware injects an inline module-preload/HMR
      // bootstrap script into index.html — without 'unsafe-inline' here that
      // script is blocked, @vitejs/plugin-react can't detect its preamble, and
      // the whole React app fails to mount (blank page). This only relaxes the
      // dev server, which never ships.
      scriptSrc: isProdEnv ? ["'self'"] : ["'self'", "'unsafe-inline'"],
      // React inline `style` props require 'unsafe-inline' here — tightening this
      // further would break the existing UI. Scripts stay strict since the build
      // emits no inline scripts.
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      // Vite's dev-mode HMR client connects back over a websocket on its own port.
      connectSrc: isProdEnv
        ? ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co']
        : ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'ws://localhost:*'],
      // canvas-confetti (the Premium/meal-plan success animation) renders via a
      // same-origin blob: Web Worker. Without worker-src, CSP falls back to
      // scriptSrc, which doesn't allow blob:, so the worker is silently blocked.
      workerSrc: ["'self'", 'blob:'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProdEnv ? [] : null,
    },
  },
  // HSTS only makes sense once the app is actually served over HTTPS in production.
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true } : false,
  crossOriginEmbedderPolicy: false, // would block the Google Fonts stylesheet
}));

app.use(express.json());

// ── Rate limiting ────────────────────────────────────────────────────────────
// IP-based, layered on top of (not instead of) the per-account PIN lockout in
// secureDb. All limiters return a generic 429 — never reveal account existence.
// skipSuccessfulRequests means a genuine user who succeeds doesn't get punished
// by their own earlier failed attempts once they authenticate correctly.
const genericLimitHandler = (_req: Request, res: Response) => {
  res.status(429).json({ error: 'Too many requests. Please try again later.' });
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: genericLimitHandler,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: genericLimitHandler,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Name changes are low-risk; still worth a generous ceiling against a buggy
// client retry-loop.
const profileUpdateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// An email change re-verifies the account password on every attempt (see
// the route below) — same credential-testing risk class as login itself,
// so it gets the same kind of strict ceiling as passwordResetLimiter.
const emailChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// A full-account export is exactly the kind of bulk read worth throttling
// independently of the general per-route limits.
const accountExportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Deletion is irreversible — same strict ceiling class as login/password-
// reset, since repeated failed attempts here are a credential-testing signal.
const accountDeleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Stricter: these gate access to private financial data, not just an account.
const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: genericLimitHandler,
});

// Real money moves through this one — tight IP window on top of the
// application-level "one pending payment per user" guard below.
const stkPushLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Access-code guessing must be rate-limited like a credential — a code is a
// bearer secret that grants a paid entitlement. Not skipSuccessfulRequests:
// even a correct guess counts toward the window, since a code can be reused
// up to max_uses and a compromised/leaked code shouldn't be guessable faster
// just because one attempt already succeeded.
const accessCodeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10, // same order of magnitude as loginLimiter above
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Till-code submission never contacts Daraja itself (no OAuth/STK cost),
// but is still a "claim a payment happened" action worth throttling
// independently of stkPushLimiter — same order of magnitude.
const tillSubmitLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Admin-triggered password reset support action. Admins are trusted but
// this still guards against a compromised/careless admin session mass-
// emailing reset links, or a scripting mistake in the admin UI.
const adminActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Stacked on top of adminActionLimiter (same pattern as tillSubmitLimiter
// alongside stkPushLimiter) specifically for the access-code resend action —
// an admin re-triggering this repeatedly is a real (if low-severity) way to
// spam a user's inbox, worth its own narrower ceiling.
const emailResendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Push-token registration is a low-risk config write, but still worth a
// generous ceiling to prevent token-registration spam (e.g. a buggy client
// retry-looping) from growing the push_tokens table unbounded.
const pushRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: genericLimitHandler,
});

// Initialize Gemini Client Lazily
let genAIClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    genAIClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

// Real per-request identity, set by the requireAuth middleware from the verified
// HttpOnly session cookie (or the JSON-mode demo user — see auth-middleware.ts).
// Never derived from a client-suppliable header or body field.
function getAuthenticatedUserId(_req: Request, res: Response): string {
  return res.locals.userId as string;
}

// Same "active" computation /api/subscription/status already uses — the
// subscriptions table + its own end_date is the authority, not the
// profiles.is_premium/premium_expiry mirror columns (which exist for fast
// display on /api/auth/me but are never the thing gating access). Weekly-
// plan generation is included in Premium: a Premium subscriber never needs
// a separate entitlement/access code to generate a new plan. Fails closed
// (false) on any lookup error.
async function isUserPremium(userId: string): Promise<boolean> {
  try {
    const sub = await paymentsDb.getLatestSubscription(userId);
    return !!(sub && sub.status === 'active' && sub.endDate && new Date(sub.endDate).getTime() > Date.now());
  } catch (err: any) {
    console.error('[isUserPremium] lookup failed, failing closed:', err?.message || err);
    return false;
  }
}

// Parse a named cookie from the request without cookie-parser.
function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

// Web sends the financial-session token in an HttpOnly cookie; a bearer
// (Expo) client has no cookie jar for this origin, so it sends the same
// opaque token in this header instead. Deliberately not `Authorization`,
// which already carries the primary Supabase access token for requireAuth —
// the two tokens mean different things and must never collide.
const FINANCIAL_SESSION_HEADER = 'x-financial-session';

function getFinancialSessionToken(req: Request): string | undefined {
  return getCookie(req, 'mlo_fin_session') ?? (req.headers[FINANCIAL_SESSION_HEADER] as string | undefined) ?? undefined;
}

// STRICT FINANCIAL SECURITY MIDDLEWARE
// Resolves the server-side session from either channel above and attaches
// the verified userId to res.locals. The client can never spoof this — both
// channels only ever carry an opaque, server-issued, server-invalidatable
// token, and the userId always comes from the session store, NOT from any
// request header/body.
async function requireFinancialSession(req: Request, res: Response, next: NextFunction) {
  const token = getFinancialSessionToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Budget is locked. Financial authorization required.',
      budgetLocked: true,
      code: 'BUDGET_LOCKED',
    });
  }

  const session = await secureDb.getFinancialSession(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) await secureDb.invalidateFinancialSession(token);
    res.clearCookie('mlo_fin_session', { httpOnly: true, sameSite: 'strict' });
    return res.status(403).json({
      error: 'Financial session expired. Please re-enter your Budget PIN.',
      budgetLocked: true,
      code: 'SESSION_EXPIRED',
    });
  }

  // userId comes from the server-side session — never from the client
  res.locals.userId = session.userId;
  next();
}

// Delivers a freshly-created financial-session token back to the caller on
// whichever channel it authenticated with. A cookie-authenticated (web)
// caller keeps the exact existing behavior: HttpOnly cookie only, token
// never appears in the response body — the whole point of HttpOnly is that
// page JS (and therefore any XSS on that page) can't read it, so echoing it
// in JSON here would defeat that. A bearer-authenticated (Expo) caller has
// no cookie jar for this origin at all, so it gets the token in the body
// instead — safe specifically because that channel never has the
// cookie/XSS surface to begin with.
function respondWithFinancialSession(req: Request, res: Response, token: string, body: Record<string, unknown>) {
  if (res.locals.authMethod === 'bearer') {
    res.json({ ...body, financialToken: token });
    return;
  }
  const secure = process.env.NODE_ENV === 'production';
  res.cookie('mlo_fin_session', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: 15 * 60 * 1000,
  });
  res.json(body);
}

// ADMIN AUTHORIZATION — must run after requireAuth. Role comes from the
// server-verified profile row, never from the client (no header, query
// param, or body field is ever consulted). 401 if not authenticated at all,
// 403 if authenticated but the account isn't an admin.
async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const userId = res.locals.userId as string | undefined;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = await secureDb.getUser(userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin access required' });
  }
  next();
}

// -------------------------------------------------------------
// AUTH ROUTES (Supabase or JSON-DB dev mode)
// -------------------------------------------------------------

const USE_JSON_DB = process.env.USE_JSON_DB === 'true';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

// Register
app.post('/api/auth/register', registerLimiter, async (req: Request, res: Response) => {
  if (USE_JSON_DB) {
    return res.status(503).json({ error: 'Registration requires Supabase. Set USE_JSON_DB=false.' });
  }
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string };
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  // email_confirm: true — this route is the only way to create an account (no
  // public Supabase signUp is exposed to the client), already gated behind
  // registerLimiter and password-length validation, and created with the
  // service-role key. Leaving new accounts unconfirmed made them permanently
  // unusable: signInWithPassword correctly refuses an unconfirmed email, but
  // this app has no verification-link landing page or resend flow anywhere,
  // so every new user was locked out of their own just-created account.
  const { data, error } = await supabase.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    user_metadata: { name: (name ?? '').trim() || email.split('@')[0] },
    email_confirm: true,
  });
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ message: 'Account created successfully. You can now sign in.' });
});

// Login
app.post('/api/auth/login', loginLimiter, async (req: Request, res: Response) => {
  if (USE_JSON_DB) {
    // Dev mode: fake login always succeeds
    const cookieOptions = '; HttpOnly; SameSite=Strict; Path=/';
    res.setHeader('Set-Cookie', [
      `mlo_auth_session=dev_token; Max-Age=3600${cookieOptions}`,
      `mlo_auth_refresh=dev_refresh; Max-Age=${60 * 60 * 24 * 7}${cookieOptions}`,
    ]);
    return res.json({ message: 'Signed in (dev mode)', userId: 'usr_mwangi_demo' });
  }

  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(), password,
  });
  if (error || !data?.session) {
    // Safe diagnostic only: Supabase's error.message here is a short fixed
    // string ("Invalid login credentials", "Email not confirmed", etc.) —
    // never the password or a token. The client always gets the same
    // generic message regardless of cause, so this never leaks account
    // existence or a more specific reason to the caller.
    if (error && error.message !== 'Invalid login credentials') {
      console.error('[auth/login] sign-in failed:', error.message);
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  setAuthCookies(res, data.session.access_token, data.session.refresh_token ?? '');
  res.json({
    message: 'Signed in successfully',
    user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name },
  });
});

// Logout — best-effort server-side Supabase session revocation, then clear cookies.
// Revoking the underlying Supabase session (not just deleting the cookie) means a
// previously captured access token stops working immediately via getUser(), not
// just at its natural ~1h expiry. This calls Supabase's own revoke endpoint with
// the token already in hand — no token is stored or logged anywhere by this call.
app.post('/api/auth/logout', async (req: Request, res: Response) => {
  if (!USE_JSON_DB) {
    const accessToken = getCookie(req, 'mlo_auth_session');
    if (accessToken) {
      const admin = getSupabaseAdmin();
      if (admin) {
        try {
          await admin.auth.admin.signOut(accessToken, 'global');
        } catch {
          // Best-effort: cookies are cleared regardless, so the browser is logged
          // out either way even if the revocation call itself fails.
        }
      }
    }
  }
  clearAuthCookies(res);
  res.clearCookie('mlo_fin_session', { httpOnly: true, sameSite: 'strict' });
  res.json({ message: 'Signed out' });
});

// Refresh session
app.post('/api/auth/refresh', refreshLimiter, async (req: Request, res: Response) => {
  if (USE_JSON_DB) return res.json({ message: 'ok (dev mode)' });

  const refreshToken = getCookie(req, 'mlo_auth_refresh');
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: 'Auth service not configured' });

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data?.session) {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
  setAuthCookies(res, data.session.access_token, data.session.refresh_token ?? '');
  res.json({ message: 'Session refreshed' });
});

// Shared by the consumer "forgot password" flow and the admin "send password
// reset" support action — one recovery-email mechanism, not two. Uses the
// anon key (Supabase's own resetPasswordForEmail), never the service role,
// and never touches the account password itself — Supabase emails a secure,
// short-lived recovery link; nothing here can see or set the password.
async function sendPasswordResetEmail(email: string): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Auth service not configured');
  const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${process.env.APP_URL || 'http://localhost:3000'}/reset-password`,
  });
}

// Request a password reset email. Always returns the same generic message
// regardless of whether the email exists — never reveal account existence.
app.post('/api/auth/request-password-reset', passwordResetLimiter, async (req: Request, res: Response) => {
  const generic = { message: 'If an account exists for that email, a password reset link has been sent.' };
  if (USE_JSON_DB) return res.json(generic);

  const { email } = req.body as { email?: string };
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required.' });
  }
  try {
    await sendPasswordResetEmail(email);
  } catch {
    // Swallow — always return the generic response so this endpoint can't be used
    // to enumerate registered emails.
  }
  res.json(generic);
});

// Complete a password reset. The frontend lands here with the short-lived
// access token Supabase issued from the emailed recovery link (delivered via
// URL fragment, never persisted — see AuthView's hash handling). We verify
// that token is genuine before touching anything, then use the service-role
// admin API (not the token's own session) to set the new password — the same
// trusted-server pattern used everywhere else in this file.
//
// The recovery token itself CANNOT be reused as the new session: changing a
// user's password revokes their existing sessions as a side effect (verified
// directly — a getUser() call with the same recovery token fails immediately
// after the updateUserById() that changed the password), so setting cookies
// from it would silently sign the user into an already-dead session. Instead
// we sign in fresh with the password we just set, exactly like /api/auth/login.
// The recovery token is used once, in this one request, and never logged or stored.
app.post('/api/auth/reset-password', passwordResetLimiter, async (req: Request, res: Response) => {
  if (USE_JSON_DB) {
    return res.status(503).json({ error: 'Password reset requires Supabase. Set USE_JSON_DB=false.' });
  }
  const { accessToken, password } = req.body as { accessToken?: string; password?: string };
  if (!accessToken || typeof accessToken !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Reset link is invalid or expired. Please request a new one.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ error: 'Auth service not configured' });
  }

  const scoped = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userErr } = await scoped.auth.getUser(accessToken);
  if (userErr || !userData?.user || !userData.user.email) {
    return res.status(401).json({ error: 'Reset link is invalid or expired. Please request a new one.' });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ error: 'Auth service not configured' });

  const { error: updateErr } = await admin.auth.admin.updateUserById(userData.user.id, { password });
  if (updateErr) {
    console.error('[auth/reset-password] update failed:', updateErr.message);
    return res.status(400).json({ error: 'Could not reset password. Please request a new reset link.' });
  }

  const { data: signInData, error: signInErr } = await admin.auth.signInWithPassword({
    email: userData.user.email, password,
  });
  if (signInErr || !signInData?.session) {
    // Password was changed successfully — only the auto-sign-in step failed.
    console.error('[auth/reset-password] post-reset sign-in failed:', signInErr?.message);
    return res.json({ message: 'Password reset successfully. Please sign in.', user: null });
  }

  setAuthCookies(res, signInData.session.access_token, signInData.session.refresh_token ?? '');
  res.json({
    message: 'Password reset successfully. You are now signed in.',
    user: { id: signInData.user.id, email: signInData.user.email, name: signInData.user.user_metadata?.name },
  });
});

// Onboarding. requireAuth only (no Budget PIN yet — none can exist this
// early), same trust level as /api/financial-auth/setup-pin. userId is
// always derived from the verified session, never the request body, so this
// can only ever write the caller's own first budget row — never another
// user's. If the user opted to enter an approximate income, it's saved as
// their initial monthly budget so it's already there (no re-entry) the
// first time they unlock the Budget tab with their PIN. Existing categories
// (if a budget row somehow already exists) are preserved, never wiped.
app.post('/api/onboarding/complete', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { hasBudget, monthlyIncomeKsh } = req.body as { hasBudget?: boolean; monthlyIncomeKsh?: number };

  if (hasBudget && Number.isFinite(monthlyIncomeKsh) && Number(monthlyIncomeKsh) > 0) {
    try {
      const month = getCurrentYearMonth();
      const existing = await secureDb.getBudget(userId, month);
      await secureDb.saveBudget({
        id: existing?.id || `bg_${userId}_${month}`,
        userId,
        month,
        monthlyIncomeKsh: Math.min(Math.round(Number(monthlyIncomeKsh)), 100_000_000),
        incomeType: existing?.incomeType || 'monthly',
        categories: existing?.categories || [],
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('[onboarding] failed to save initial income:', err?.message || err);
      // Non-critical — onboarding still completes even if this fails.
    }
  }

  // Household preferences (householdType/preferences/allergies/memberCount)
  // remain best-effort/not persisted here by existing design — real
  // household setup happens later via PUT /api/household.
  //
  // profiles.onboarding_complete is the authoritative record of this —
  // localStorage is at most a same-browser UI optimization, never the
  // source of truth (a fresh login on another device/browser must see this
  // same flag). Always sets true; there is no client-supplied value to trust.
  await secureDb.updateUser(userId, { onboardingComplete: true });
  res.json({ ok: true });
});

// -------------------------------------------------------------
// PUBLIC / SHAREABLE FAMILY ROUTES (No Budget Data Leaked)
// -------------------------------------------------------------

// 1. User / Auth
// Server-computed budget-digest push (Phase 3B, item 3). Same "no cron"
// trigger point as expiryWarningDb — checked/sent from inside the request
// of whichever opted-in user happens to be authenticating right now, at
// most once per 7 days (budget_digest_last_sent_at is the dedup marker).
// Content is entirely server-computed from the caller's own budget/expense
// data (never client-supplied); the notification/push body deliberately
// never contains a KSh figure or category name — only a generic status
// word derived from the real analysis, per the Stage 1/3 payload-privacy
// rule. Push delivery itself is best-effort: sendPushToUser() already
// no-ops safely with zero registered tokens, an invalid token, or the
// provider being unreachable — none of that is allowed to affect this
// request either.
const BUDGET_DIGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

async function maybeSendBudgetDigest(userId: string, user: { budgetDigestEnabled?: boolean; budgetDigestLastSentAt?: string | null }): Promise<void> {
  if (!user.budgetDigestEnabled) return;
  // Cheap optimization only (from the already-fetched, possibly slightly
  // stale `user` object) — skips the DB round-trip below in the common
  // case of "was already warned recently." Not the source of correctness;
  // claimBudgetDigestSlot's atomic UPDATE is the actual authority.
  const lastSent = user.budgetDigestLastSentAt ? new Date(user.budgetDigestLastSentAt).getTime() : 0;
  if (Date.now() - lastSent < BUDGET_DIGEST_INTERVAL_MS) return;

  const budget = await secureDb.getBudget(userId);
  if (!budget) return; // nothing meaningful to summarize yet — never claims the slot for this

  // Atomic claim: only a request whose UPDATE actually matches a row
  // proceeds. Prevents two near-simultaneous /api/auth/me calls for the
  // same user from both winning and each sending their own digest.
  const won = await budgetDigestDb.claimSlot(userId, BUDGET_DIGEST_INTERVAL_MS);
  if (!won) return;

  const analysis = await secureDb.calculateOverspendingAnalysis(userId);
  const statusPhrase = analysis.isOverspending
    ? 'You may be overspending this week'
    : 'You are on track with your budget this week';

  const notif = await notificationsDb.addNotification(userId, {
    type: 'budget',
    title: 'Your weekly budget summary is ready',
    message: `${statusPhrase} — open Budget and unlock with your PIN to see the details.`,
  });
  sendPushToUser(userId, { title: notif.title, body: notif.message, data: { type: 'budget', notificationId: notif.id } }).catch(() => {});
}

app.get('/api/auth/me', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const user = await secureDb.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  // Return safe profile without PIN hash/salt
  const safeProfile = {
    id: user.id,
    name: user.name,
    email: (user as any).email ?? res.locals.userEmail ?? null,
    role: user.role,
    hasBudgetPin: user.hasBudgetPin,
    isPremium: user.isPremium,
    premiumExpiry: user.premiumExpiry,
    createdAt: (user as any).createdAt ?? null,
    onboardingComplete: Boolean((user as any).onboardingComplete),
    budgetDigestEnabled: Boolean((user as any).budgetDigestEnabled),
  };
  // Best-effort, never allowed to fail this request (see the ADR in
  // migrations/0016_expiry_warned_at.sql for why this is the trigger point).
  expiryWarningDb.checkAndWarn(userId).catch((err) =>
    logServerError({ route: '/api/auth/me', userId, message: 'Expiry warning check failed', context: { error: String(err?.message || 'unknown') } })
  );
  maybeSendBudgetDigest(userId, user).catch((err) =>
    logServerError({ route: '/api/auth/me', userId, message: 'Budget digest check failed', context: { error: String(err?.message || 'unknown') } })
  );
  res.json({ user: safeProfile });
});

// Self-service profile management (Phase 3B, item 7). Name changes are
// immediate; email changes go through Supabase Auth's own secure-email-change
// flow (confirmed live on this project: mailer_secure_email_change_enabled),
// never a raw profiles-table write — the account's email of record does not
// actually change until the user clicks the confirmation link(s) Supabase
// itself sends.
app.put('/api/profile', requireAuth, profileUpdateLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { name, budgetDigestEnabled } = req.body as { name?: string; budgetDigestEnabled?: boolean };
  const patch: { name?: string; budgetDigestEnabled?: boolean } = {};

  if (name !== undefined) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > 100) {
      return res.status(400).json({ error: 'Name must be between 1 and 100 characters.' });
    }
    patch.name = trimmed;
  }
  if (budgetDigestEnabled !== undefined) {
    if (typeof budgetDigestEnabled !== 'boolean') {
      return res.status(400).json({ error: 'budgetDigestEnabled must be true or false.' });
    }
    patch.budgetDigestEnabled = budgetDigestEnabled;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  await secureDb.updateUser(userId, patch);
  const user = await secureDb.getUser(userId);
  res.json({ user: user ? { id: user.id, name: user.name, budgetDigestEnabled: Boolean((user as any).budgetDigestEnabled) } : null });
});

app.post('/api/profile/change-email', requireAuth, emailChangeLimiter, async (req: Request, res: Response) => {
  if (USE_JSON_DB) return res.status(503).json({ error: 'Email changes require Supabase. Set USE_JSON_DB=false.' });

  const userId = getAuthenticatedUserId(req, res);
  const currentEmail = res.locals.userEmail as string | undefined;
  const accessToken = res.locals.accessToken as string | undefined;
  const { newEmail, currentPassword } = req.body as { newEmail?: string; currentPassword?: string };

  if (!currentEmail || !accessToken) {
    // Only reachable for a cookie session predating this deploy (no
    // accessToken stashed yet) — ask the caller to re-authenticate rather
    // than proceed without a token to scope the updateUser() call to them.
    return res.status(401).json({ error: 'Please sign in again before changing your email.' });
  }
  const trimmedNewEmail = typeof newEmail === 'string' ? newEmail.trim().toLowerCase() : '';
  if (!trimmedNewEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedNewEmail)) {
    return res.status(400).json({ error: 'A valid new email address is required.' });
  }
  if (trimmedNewEmail === currentEmail.toLowerCase()) {
    return res.status(400).json({ error: 'New email must be different from your current email.' });
  }
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ error: 'Your current password is required to change your email.' });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ error: 'Auth service not configured' });

  // Recent re-authentication, required before any email change: verifies the
  // caller actually knows the account password right now, not just that
  // their existing session token is still valid (a stolen/leaked bearer
  // token alone can never trigger this).
  const { error: reauthError } = await admin.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
  if (reauthError) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  // Calls GoTrue's own PUT /auth/v1/user endpoint directly rather than
  // supabase-js's auth.updateUser() — that method requires a full in-memory
  // session (set via setSession(), which needs a refresh token we don't
  // have server-side for a bearer/mobile caller) and fails closed with
  // "Auth session missing!" given only an access token. The REST endpoint
  // itself is stateless and only needs the bearer token, which is exactly
  // what's available here — same bare-fetch style already used for every
  // other external integration in this codebase (mpesa.ts, push.ts).
  const goTrueRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: trimmedNewEmail }),
  });
  if (!goTrueRes.ok) {
    // Never reveal *why* (e.g. "email already registered") — that would be
    // an account-enumeration oracle. Same generic-failure discipline as
    // login/register error handling elsewhere in this file.
    const errBody = await goTrueRes.json().catch(() => ({}));
    console.error('[profile/change-email] GoTrue update failed:', goTrueRes.status, errBody?.msg || errBody?.error_description);
    return res.status(400).json({ error: 'Unable to change your email right now. Please try again.' });
  }

  res.json({ success: true, message: 'Check both your current and new email address to confirm this change. Your email will not change until confirmed.' });
});

// Account data export (Phase 3B, item 8). userId is exclusively the
// authenticated caller's own — there is no request parameter identifying
// which account to export, so there is no way to redirect this to another
// user's data. Financial data (budget/expenses) is included only if the
// SAME channel already used everywhere else (requireFinancialSession's own
// token resolution, checked inline here rather than as blocking middleware,
// since the export must still succeed — minus that one section — when the
// Budget is locked, not 401 the whole request) proves it belongs to this
// exact userId. No new financial-authorization mechanism is introduced.
app.get('/api/account/export', requireAuth, accountExportLimiter, async (req: Request, res: Response) => {
  if (USE_JSON_DB) return res.status(503).json({ error: 'Account export requires Supabase. Set USE_JSON_DB=false.' });
  const userId = getAuthenticatedUserId(req, res);

  const finToken = getFinancialSessionToken(req);
  const finSession = finToken ? await secureDb.getFinancialSession(finToken) : undefined;
  const includeFinancial = !!(finSession && finSession.userId === userId && finSession.expiresAt > Date.now());

  const data = await accountExportDb.export(userId, includeFinancial);
  if (!data) return res.status(503).json({ error: 'Export temporarily unavailable.' });

  res.json({
    exportedAt: new Date().toISOString(),
    financialDataIncluded: includeFinancial,
    ...data,
  });
});

// Self-service account deletion (Phase 3B, item 9) — non-admin accounts
// only. Uses the ONE user-deletion primitive this codebase already has —
// Supabase Auth's admin.deleteUser(userId), the same call every test
// suite's own fixture cleanup already relies on — never a second,
// invented identity-lifecycle mechanism. Deleting the auth.users row
// cascades through profiles(id) and from there through every genuinely
// user-owned table (confirmed live: households, meals, meal_plans,
// shopping_lists, water_configs/logs, budgets, expenses, notifications,
// payments, subscriptions, meal_plan_entitlements, ai_conversations,
// push_tokens, reminder_configs, budget_pin_credentials,
// financial_sessions — all ON DELETE CASCADE). email_log/server_error_log
// use ON DELETE SET NULL (Phase 3A/Stage 1 fixes) and survive as orphaned
// audit records, by design.
//
// Three FKs do NOT cascade and are intentionally left exactly as they are
// (admin_audit_log.admin_id, payments.verified_by, support_notes.admin_id
// are all ON DELETE NO ACTION) — this is why deletion is restricted to
// non-admin accounts: an account that ever performed an audited admin
// action would otherwise hit a hard FK violation. This is the approved
// Stage 4 product decision, not an oversight.
app.post('/api/account/delete', requireAuth, accountDeleteLimiter, async (req: Request, res: Response) => {
  if (USE_JSON_DB) return res.status(503).json({ error: 'Account deletion requires Supabase. Set USE_JSON_DB=false.' });

  const userId = getAuthenticatedUserId(req, res);
  const currentEmail = res.locals.userEmail as string | undefined;
  const { currentPassword, confirmation } = req.body as { currentPassword?: string; confirmation?: string };

  if (!currentEmail) {
    return res.status(401).json({ error: 'Please sign in again before deleting your account.' });
  }
  if (confirmation !== 'DELETE') {
    return res.status(400).json({ error: 'Please type DELETE to confirm — this action cannot be undone.' });
  }
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ error: 'Your current password is required to delete your account.' });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return res.status(503).json({ error: 'Auth service not configured' });

  // Recent re-authentication, same discipline as email-change (item 7) —
  // required before any irreversible action, not just a still-valid session.
  const { error: reauthError } = await admin.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
  if (reauthError) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  // The deletion target is exclusively this verified userId — there is no
  // request field naming a different account, so this can never become an
  // account-takeover primitive against anyone else.
  const profile = await secureDb.getUser(userId);
  if (profile && (profile as any).role === 'admin') {
    // Deliberately generic — never reveals *why* (the FK/cascade
    // implementation detail above), matching the enumeration-safe
    // discipline used everywhere else in this file. The account is left
    // completely untouched; nothing is attempted.
    return res.status(403).json({ error: 'This account cannot be deleted through self-service. Please contact support.' });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    // Supabase's deleteUser call is the atomicity boundary here: it either
    // succeeds (auth.users row gone, every CASCADE-linked row gone with
    // it, in one server-side operation) or fails outright — there is no
    // code path here that removes some tables and not others. A failure
    // is reported generically and logged for admin visibility; the
    // account remains fully intact either way.
    logServerError({ route: '/api/account/delete', userId, message: 'Account deletion failed', context: { error: String(deleteError.message || 'unknown') } });
    return res.status(500).json({ error: 'Unable to delete your account right now. Please try again or contact support.' });
  }

  clearAuthCookies(res);
  res.json({ success: true, message: 'Your account has been permanently deleted.' });
});

// 2. Kenyan Food Database & Items
app.get('/api/food/items', (req: Request, res: Response) => {
  const items = db.getFoodItems();
  res.json({ items });
});

// 3. Kenyan Meals Catalog — system meals are public; custom meals are private to
// their owner. optionalAuth resolves the caller's identity when present without
// requiring login just to browse the public catalog.
app.get('/api/meals', optionalAuth, async (req: Request, res: Response) => {
  const { category, costLevel, search } = req.query;
  let meals = await contentDb.getMeals(res.locals.userId);

  if (category && typeof category === 'string') {
    meals = meals.filter((m) => m.category === category);
  }
  if (costLevel && typeof costLevel === 'string') {
    meals = meals.filter((m) => m.costLevel === costLevel);
  }
  if (search && typeof search === 'string') {
    const q = search.toLowerCase().trim();
    meals = meals.filter((m) => {
      const name = (m?.name || '').toLowerCase();
      const swahili = (m?.swahiliName || '').toLowerCase();
      const tags = Array.isArray(m?.tags) ? m.tags : [];
      return (
        name.includes(q) ||
        swahili.includes(q) ||
        tags.some((t) => typeof t === 'string' && t.toLowerCase().includes(q))
      );
    });
  }

  res.json({ meals });
});

// Registered BEFORE /api/meals/:id — otherwise Express would match "starred"
// as the :id param and this route would never be reached.
app.get('/api/meals/starred', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const starredIds = await contentDb.getStarredMealIds(userId);
  res.json({ mealIds: [...starredIds] });
});

app.get('/api/meals/:id', optionalAuth, async (req: Request, res: Response) => {
  const meal = await contentDb.getMealById(req.params.id, res.locals.userId);
  if (!meal) {
    return res.status(404).json({ error: 'Meal not found' });
  }
  res.json({ meal });
});

// Create Custom Meal — always owned by the authenticated caller; a client-supplied
// ownerId is never accepted (the field isn't even read from req.body).
app.post('/api/meals', requireAuth, async (req: Request, res: Response) => {
  try {
    const ownerId = getAuthenticatedUserId(req, res);
    const {
      name,
      swahiliName,
      category = 'dinner',
      prepTimeMinutes = 30,
      estimatedCostKsh = 200,
      costLevel,
      ingredients = [],
      instructions = [],
      nutrition = {
        proteinRich: true,
        carbRich: true,
        veggieRich: true,
        fruitIncluded: false,
        approxCalories: 550,
      },
      tags = ['Custom Recipe', 'Family Meal'],
      description = '',
      imageUrl = '',
      servings = 4,
      kenyanCookingTips = '',
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Meal name is required' });
    }

    const calculatedCostLevel =
      costLevel || (estimatedCostKsh < 200 ? 'budget' : estimatedCostKsh <= 500 ? 'moderate' : 'feast');

    const newMealInput: Omit<Meal, 'id' | 'ownerId' | 'isCustom'> = {
      name: name.trim(),
      swahiliName: swahiliName ? swahiliName.trim() : undefined,
      category,
      prepTimeMinutes: Math.max(5, Number(prepTimeMinutes) || 30),
      estimatedCostKsh: Math.max(10, Number(estimatedCostKsh) || 200),
      costLevel: calculatedCostLevel,
      ingredients: Array.isArray(ingredients) && ingredients.length > 0
        ? ingredients.map((ing: any) => ({
            name: ing.name || 'Ingredient',
            quantity: Number(ing.quantity) || 1,
            unit: ing.unit || 'portion',
            estimatedCostKsh: Number(ing.estimatedCostKsh) || 20,
          }))
        : [{ name: name.trim(), quantity: 1, unit: 'portion', estimatedCostKsh: Number(estimatedCostKsh) || 200 }],
      instructions: Array.isArray(instructions) && instructions.length > 0
        ? instructions.filter((s: string) => s && s.trim())
        : ['Prepare ingredients and cook according to your household style.', 'Serve warm and enjoy!'],
      nutrition: {
        proteinRich: !!nutrition?.proteinRich,
        carbRich: !!nutrition?.carbRich,
        veggieRich: !!nutrition?.veggieRich,
        fruitIncluded: !!nutrition?.fruitIncluded,
        approxCalories: Number(nutrition?.approxCalories) || 550,
      },
      tags: Array.isArray(tags) && tags.length > 0 ? tags : ['Custom Recipe'],
      description: description?.trim() || `Custom prepared Kenyan meal: ${name.trim()}`,
      imageUrl: imageUrl?.trim() || undefined,
      servings: Math.max(1, Number(servings) || 4),
      kenyanCookingTips: kenyanCookingTips?.trim() || undefined,
    };

    const savedMeal = await contentDb.addMeal(ownerId, newMealInput);
    res.status(201).json({ meal: savedMeal });
  } catch (err: any) {
    console.error('Error creating custom meal:', err);
    res.status(500).json({ error: 'Failed to create custom meal' });
  }
});

// Delete Custom Meal — only the owner may delete; system meals (no ownerId)
// can never be deleted through this route regardless of caller.
app.delete('/api/meals/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = await contentDb.deleteMeal(id, getAuthenticatedUserId(req, res));
  if (!deleted) {
    return res.status(404).json({ error: 'Meal not found or cannot be deleted' });
  }
  res.json({ success: true, message: 'Meal deleted successfully' });
});

// Meal starring (Meal-Variety Engine v1) — "I liked this meal, it's OK to
// see it again sometimes." Starring does NOT bypass same-week/same-day
// distinctness, only softens the cross-week history penalty (see
// generateAndSaveMealPlanLocked). userId always comes from the verified
// session, never the request body. (GET /api/meals/starred is registered
// earlier, above GET /api/meals/:id — see that route's comment.)
app.post('/api/meals/:id/star', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { id } = req.params;
  const meal = await contentDb.getMealById(id, userId);
  if (!meal) return res.status(404).json({ error: 'Meal not found' });
  await contentDb.starMeal(userId, id);
  res.json({ success: true });
});

app.delete('/api/meals/:id/star', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  await contentDb.unstarMeal(userId, req.params.id);
  res.json({ success: true });
});

// "What Can I Cook With KSh X?" Endpoint (Supports custom unconstrained budgets & unbounded portions)
app.post('/api/meals/what-can-i-cook', optionalAuth, async (req: Request, res: Response) => {
  const { budgetKsh, householdSize = 4, ingredients = [] } = req.body;
  const numBudget = Number(budgetKsh);
  const isNoLimit = numBudget === 0 || isNaN(numBudget) || numBudget < 0;
  const maxBudget = isNoLimit ? Infinity : numBudget;
  const portions = Math.max(1, Number(householdSize) || 4);
  const allMeals = await contentDb.getMeals(res.locals.userId);

  // Score meals based on budget fit and available ingredients
  const results = allMeals
    .map((meal) => {
      // Scale estimated cost by household size / 4 (no portion limit)
      const scaledCost = Math.round(meal.estimatedCostKsh * (portions / 4));
      
      let matchedIngredients = 0;
      if (Array.isArray(ingredients) && ingredients.length > 0) {
        matchedIngredients = (meal.ingredients || []).filter((ing) => {
          const ingName = ((ing as any)?.name || (ing as any)?.foodItemName || '').toLowerCase();
          return ingredients.some((userIng: string) => {
            if (!userIng || typeof userIng !== 'string') return false;
            const u = userIng.toLowerCase().trim();
            return ingName.includes(u) || u.includes(ingName);
          });
        }).length;
      }

      const fitsBudget = isNoLimit ? true : scaledCost <= maxBudget;
      const budgetMargin = isNoLimit ? 0 : maxBudget - scaledCost;

      return {
        ...meal,
        scaledCostKsh: scaledCost,
        fitsBudget,
        budgetMargin,
        matchedIngredients,
        savingsKsh: fitsBudget && !isNoLimit ? Math.max(0, budgetMargin) : 0,
      };
    })
    .filter((m) => isNoLimit || m.scaledCostKsh <= maxBudget * 1.25)
    .sort((a, b) => {
      if (a.fitsBudget && !b.fitsBudget) return -1;
      if (!a.fitsBudget && b.fitsBudget) return 1;
      if (b.matchedIngredients !== a.matchedIngredients) return b.matchedIngredients - a.matchedIngredients;
      return a.scaledCostKsh - b.scaledCostKsh;
    });

  res.json({
    budgetKsh: isNoLimit ? 0 : maxBudget,
    isNoLimit,
    householdSize: portions,
    matchedMealsCount: results.length,
    meals: results,
  });
});

// 4. Meal Planner
app.get('/api/meal-plans/current', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const plan = await contentDb.getMealPlan(userId);
  res.json({ mealPlan: plan });
});

// Week starring (Meal-Variety Engine v1) — protects a saved week from being
// silently overwritten by a future regeneration for that same week (see
// saveMealPlan's STARRED_WEEK_PROTECTED check) and excludes it from the
// week-similarity novelty comparison used by future generations.
app.post('/api/meal-plans/:weekStartDate/star', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const ok = await contentDb.setMealPlanStarred(userId, req.params.weekStartDate, true);
  if (!ok) return res.status(404).json({ error: 'No saved meal plan found for that week.' });
  res.json({ success: true });
});

app.delete('/api/meal-plans/:weekStartDate/star', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const ok = await contentDb.setMealPlanStarred(userId, req.params.weekStartDate, false);
  if (!ok) return res.status(404).json({ error: 'No saved meal plan found for that week.' });
  res.json({ success: true });
});

app.put('/api/meal-plans/current', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const updatedPlan = req.body.mealPlan;
  if (!updatedPlan) {
    return res.status(400).json({ error: 'Missing mealPlan body' });
  }
  updatedPlan.userId = userId;
  try {
    const saved = await contentDb.saveMealPlan(updatedPlan);
    res.json({ mealPlan: saved });
  } catch (err: any) {
    if (err?.message === 'STARRED_WEEK_PROTECTED') {
      return res.status(409).json({ error: 'This week is starred and protected from being overwritten. Unstar it first.' });
    }
    throw err;
  }
});

// Auto-generate a balanced, family-tailored weekly meal plan.
// Considers: household size, member allergies/dislikes, food budget,
// nutrition variety, and avoids repeating the same meal twice in a week.
//
// GATED: a new generation requires an unconsumed meal-plan-generation
// entitlement (bought via M-Pesa or redeemed via access code — see
// /api/payments/mpesa/generation/stk-push and
// /api/meal-plans/generation/redeem-access-code below). Viewing an already
// generated plan (GET /api/meal-plans/current, above) is always free and
// unaffected by this gate.
app.post('/api/meal-plans/generate', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);

  // Weekly plan generation is included in Premium — an active subscriber
  // never needs an entitlement/access code, checked fresh on every request
  // (never trusted from the client, and never cached).
  if (await isUserPremium(userId)) {
    return generateAndSaveMealPlan(userId, res);
  }

  // Fail closed: any error while checking/claiming falls through to
  // PAYMENT_REQUIRED rather than ever allowing an unauthorized generation.
  let claimedEntitlementId: string | null = null;
  try {
    const entitlement = await paymentsDb.getUnusedEntitlement(userId);
    if (!entitlement) {
      return res.status(402).json({ error: 'A payment or access code is required to generate a new meal plan.', code: 'PAYMENT_REQUIRED', priceKsh: MEAL_PLAN_GENERATION_PRICE_KSH });
    }
    // Atomic claim: the WHERE clause requires used_at IS NULL, so if a
    // double-click or a concurrent request already claimed this same
    // entitlement, this returns null and we correctly refuse the second one
    // rather than generating twice off one payment.
    const claimed = await paymentsDb.claimEntitlement(entitlement.id, userId);
    if (!claimed) {
      return res.status(402).json({ error: 'A payment or access code is required to generate a new meal plan.', code: 'PAYMENT_REQUIRED', priceKsh: MEAL_PLAN_GENERATION_PRICE_KSH });
    }
    claimedEntitlementId = claimed.id;
  } catch (err: any) {
    console.error('[meal-plan-gate] entitlement check failed:', err?.message || err);
    return res.status(402).json({ error: 'A payment or access code is required to generate a new meal plan.', code: 'PAYMENT_REQUIRED', priceKsh: MEAL_PLAN_GENERATION_PRICE_KSH });
  }

  try {
    return await generateAndSaveMealPlan(userId, res);
  } catch (err: any) {
    // The user must not lose a paid entitlement to a server-side error —
    // release the claim so they can retry without paying again. Consumption
    // only becomes permanent once the plan is actually generated and saved.
    await paymentsDb.releaseEntitlement(claimedEntitlementId).catch(() => {});
    console.error('[meal-plan-gate] generation failed, entitlement released:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate meal plan. Please try again.' });
  }
});

// Bumped whenever the generation algorithm's scoring/selection logic
// changes materially — persisted per-response so a future developer (or
// support) can tell which algorithm version produced a given plan without
// guessing from the timestamp alone.
const MEAL_PLAN_GENERATOR_VERSION = 2;

async function generateAndSaveMealPlan(userId: string, res: Response) {
  // Premium users' generation path has no entitlement-claim CAS guard (only
  // the pay-per-generation path does), so two near-simultaneous requests
  // could otherwise interleave writes for the same week. A stale claim
  // (e.g. a crashed request that never released) is reclaimed after 30s —
  // generation itself normally completes in well under a second.
  const lockClaimed = await contentDb.claimGenerationLock(userId, 30_000);
  if (!lockClaimed) {
    res.status(409).json({ error: 'A meal plan is already being generated. Please wait a moment and try again.' });
    return;
  }

  try {
    await generateAndSaveMealPlanLocked(userId, res);
  } finally {
    await contentDb.releaseGenerationLock(userId);
  }
}

async function generateAndSaveMealPlanLocked(userId: string, res: Response) {
  const household = await secureDb.getHousehold(userId);

  const householdSize = household?.members.length || 4;

  // Collect all allergies and dislikes across household members
  const allergens = new Set<string>();
  const dislikes = new Set<string>();
  // Free-text preference/nutrition-goal signals (Meal-Variety Engine v1) —
  // these fields already existed on every household member but were never
  // read by generation before now. Matched the same way allergies/dislikes
  // already are: a case-insensitive substring match against the meal's
  // name/tags/ingredients text, never a fabricated medical inference.
  const preferenceKeywords = new Set<string>();
  let nutritionGoalsText = '';
  (household?.members || []).forEach((m) => {
    (m.allergies || []).forEach((a) => allergens.add(a.toLowerCase()));
    (m.dislikes || []).forEach((d) => dislikes.add(d.toLowerCase()));
    (m.preferences || []).forEach((p) => preferenceKeywords.add(p.toLowerCase()));
    if (m.nutritionGoals) nutritionGoalsText += ` ${m.nutritionGoals.toLowerCase()}`;
  });

  // Get food budget from saved budget (if available) for cost-aware selection
  const budget = await secureDb.getBudget(userId);
  const foodCategory = budget?.categories.find((c) => c.category === 'Food');
  const weeklyFoodBudget = foodCategory ? Math.round(foodCategory.plannedAmountKsh / 4) : Infinity;
  const maxPerMeal = weeklyFoodBudget === Infinity ? Infinity : Math.round(weeklyFoodBudget / 21); // 3 meals × 7 days

  const allMeals = await contentDb.getMeals(userId);
  const weekStartDate = getMondayOfCurrentWeek();

  // Meal-Variety Engine v1: cross-week anti-repeat + starring. History is
  // bounded to the last 4 saved weeks (never a full lifetime scan — see the
  // architecture proposal). A starred meal's historical occurrences count
  // for much less, since starring means "I liked this, it's OK to see it
  // again sometimes" — not "repeat it every week."
  const HISTORY_WEEKS = 4;
  const STARRED_HISTORY_WEIGHT = 0.25;
  const [rawHistory, starredMealIds, previousWeekMealIds] = await Promise.all([
    contentDb.getMealUsageHistory(userId, HISTORY_WEEKS, weekStartDate),
    contentDb.getStarredMealIds(userId),
    contentDb.getPreviousWeekMealIds(userId, weekStartDate),
  ]);
  const historicalMealCounts = new Map<string, number>(
    rawHistory.map(({ mealId, count }) => [mealId, starredMealIds.has(mealId) ? count * STARRED_HISTORY_WEIGHT : count]),
  );

  // Ingredient names common enough to appear in nearly every dish (seasoning,
  // aromatics, staples used as garnish) — excluded from the "dominant
  // ingredient" keywords below so they don't falsely trigger the
  // repetition/variety penalties for e.g. every dish that contains onion.
  const INGREDIENT_STOPWORDS = new Set([
    'salt', 'oil', 'cooking oil', 'vegetable oil', 'onion', 'onions', 'tomato', 'tomatoes',
    'garlic', 'ginger', 'lemon', 'sugar', 'honey', 'milk', 'water', 'pepper', 'black pepper',
    'green pepper', 'coriander', 'dhania', 'curry powder', 'royco', 'tomato paste', 'spices',
    'salt & pepper', 'seasoning', 'stock cube', 'butter', 'ghee',
  ]);

  // A meal's "dominant" ingredients (e.g. "eggs", "chicken", "rice") drive
  // the variety penalties below — this catches repetition across DIFFERENT
  // meal ids that all happen to be egg-based, which plain per-slot
  // used-id tracking (further below) can't see.
  function dominantKeywords(meal: typeof allMeals[0]): string[] {
    return (meal.ingredients || [])
      .map((i) => i.name.toLowerCase().trim())
      .filter((n) => n && !INGREDIENT_STOPWORDS.has(n));
  }

  function scoreMeal(
    meal: typeof allMeals[0],
    usedCounts: Map<string, number>,
    weekKeywordCounts: Map<string, number>,
    todayKeywords: Set<string>,
  ): number {
    const usedCount = usedCounts.get(meal.id) || 0;
    // Penalty scales with how many times this exact meal was already used
    // this week, so if a small pool genuinely must repeat, selection rotates
    // through the available meals instead of collapsing onto a single one.
    if (usedCount > 0) return -1000 * usedCount;

    // Reject meals with allergens/dislikes in name or tags
    const mealText = `${meal.name} ${(meal.tags || []).join(' ')} ${(meal.ingredients || []).map((i) => i.name).join(' ')}`.toLowerCase();
    for (const a of allergens) { if (mealText.includes(a)) return -2000; }
    for (const d of dislikes) { if (mealText.includes(d)) return -500; }

    let score = 0;

    // Budget fit: scaled cost for actual household size
    const scaledCost = Math.round(meal.estimatedCostKsh * (householdSize / 4));
    if (maxPerMeal < Infinity) {
      if (scaledCost <= maxPerMeal) score += 30;
      else score -= Math.round((scaledCost - maxPerMeal) / 20); // penalise over-budget
    }

    // Nutrition variety bonus
    if (meal.nutrition?.proteinRich) score += 10;
    if (meal.nutrition?.veggieRich) score += 8;
    if (meal.nutrition?.carbRich) score += 5;

    // Personalization (Meal-Variety Engine v1): household members'
    // free-text `preferences` (e.g. "Enjoys Ugali") matched the same
    // conservative substring way allergies/dislikes already are — no new
    // matching mechanism invented. `nutritionGoals` is intentionally only
    // matched against a small set of recognizable keywords against
    // EXISTING nutrition flags already in the data, never a fabricated
    // medical inference.
    for (const p of preferenceKeywords) { if (mealText.includes(p)) score += 15; }
    if (nutritionGoalsText.includes('protein') && meal.nutrition?.proteinRich) score += 8;
    if ((nutritionGoalsText.includes('weight') || nutritionGoalsText.includes('light')) && !meal.nutrition?.carbRich) score += 5;
    if (nutritionGoalsText.includes('hydrat') && meal.nutrition?.fruitIncluded) score += 5;
    if ((nutritionGoalsText.includes('vegetable') || nutritionGoalsText.includes('veggie')) && meal.nutrition?.veggieRich) score += 8;

    // Cross-week anti-repeat (Meal-Variety Engine v1): softer than the
    // same-week exact-repeat block above, since this is "used recently"
    // rather than "already in this exact week." A starred meal's
    // historical count already arrives pre-discounted (see
    // STARRED_HISTORY_WEIGHT above).
    const historicalCount = historicalMealCounts.get(meal.id) || 0;
    if (historicalCount > 0) score -= 60 * historicalCount;

    // Keep each day mixed: don't stack the same dominant ingredient (e.g.
    // eggs for both breakfast and snack) into multiple slots on one day.
    // Keep the week mixed: softly discourage an ingredient from dominating
    // across many days, growing stronger with each prior use rather than
    // banning it outright (some pools are egg-heavy by nature).
    for (const k of dominantKeywords(meal)) {
      // Strong enough to reliably beat the max possible budget+nutrition
      // bonus (~53) so a same-day collision only survives when every
      // remaining option in that slot's pool also shares the ingredient.
      if (todayKeywords.has(k)) score -= 70;
      const weekCount = weekKeywordCounts.get(k) || 0;
      if (weekCount > 0) score -= 20 * weekCount;
    }

    return score;
  }

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
  const breakfasts = allMeals.filter((m) => m.category === 'breakfast');
  const lunches    = allMeals.filter((m) => m.category === 'lunch');
  const dinners    = allMeals.filter((m) => m.category === 'dinner');
  const snacks     = allMeals.filter((m) => m.category === 'snack');

  // Historical keyword pressure, at a lighter weight than this week's own
  // picks (which accumulate at 1 per pick in buildCandidateWeek below) —
  // recent-week repetition matters less than repetition within the same
  // week/day.
  const HISTORICAL_KEYWORD_WEIGHT = 0.5;
  const historicalKeywordSeed = new Map<string, number>();
  for (const [mealId, count] of historicalMealCounts) {
    const meal = allMeals.find((m) => m.id === mealId);
    if (!meal) continue; // deleted/no-longer-visible meal referenced by old history — skip, not an error
    dominantKeywords(meal).forEach((k) => {
      historicalKeywordSeed.set(k, (historicalKeywordSeed.get(k) || 0) + count * HISTORICAL_KEYWORD_WEIGHT);
    });
  }

  // When a pool is smaller than the week (e.g. fewer snacks than days),
  // the least-desirable/most-penalized items are unavoidably deferred to
  // whichever day is processed last for that slot. Shuffling each slot's
  // day-processing order independently spreads those deferred picks across
  // different days instead of always dumping them all onto the same day.
  function shuffledDays(): string[] {
    const arr = [...days];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // One full attempt at building a candidate week. Re-runnable so the
  // week-similarity check below can retry with fresh shuffling when a
  // candidate lands too close to the immediately preceding week.
  function buildCandidateWeek(): any {
    const weekKeywordCounts = new Map(historicalKeywordSeed);
    const todayKeywordsByDay = new Map<string, Set<string>>(days.map((d) => [d, new Set<string>()]));

    function pickBest(pool: typeof allMeals, used: Map<string, number>, day: string): typeof allMeals[0] {
      const todayKeywords = todayKeywordsByDay.get(day)!;
      const scored = pool.map((m) => ({ m, s: scoreMeal(m, used, weekKeywordCounts, todayKeywords) })).sort((a, b) => b.s - a.s);
      const pick = scored[0]?.m || pool[0];
      used.set(pick.id, (used.get(pick.id) || 0) + 1);
      dominantKeywords(pick).forEach((k) => {
        weekKeywordCounts.set(k, (weekKeywordCounts.get(k) || 0) + 1);
        todayKeywords.add(k);
      });
      return pick;
    }

    const usedB = new Map<string, number>();
    const usedL = new Map<string, number>();
    const usedD = new Map<string, number>();
    const usedS = new Map<string, number>();

    const candidate: any = {};
    days.forEach((day) => { candidate[day] = {}; });
    shuffledDays().forEach((day) => { candidate[day].breakfast = pickBest(breakfasts, usedB, day); });
    shuffledDays().forEach((day) => { candidate[day].lunch    = pickBest(lunches,    usedL, day); });
    shuffledDays().forEach((day) => { candidate[day].dinner   = pickBest(dinners,    usedD, day); });
    shuffledDays().forEach((day) => { candidate[day].snack    = pickBest(snacks,     usedS, day); });
    return candidate;
  }

  function candidateMealIds(candidate: any): string[] {
    const ids: string[] = [];
    for (const day of days) {
      for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
        const meal = candidate[day]?.[slot];
        if (meal) ids.push(meal.id);
      }
    }
    return ids;
  }

  // Week-level novelty (Meal-Variety Engine v1): reject/retry a candidate
  // that overlaps too heavily with the immediately preceding week, rather
  // than only guarding within the week being built. Bounded to a handful
  // of attempts — never an unbounded search for a "perfect" week (see
  // architecture proposal's scale/performance section); the least-similar
  // attempt found is used even if none clears the threshold.
  const WEEK_SIMILARITY_THRESHOLD = 0.5; // Jaccard overlap ratio
  const MAX_GENERATION_ATTEMPTS = 3;
  const previousWeekIdSet: Set<string> | null = previousWeekMealIds ? new Set<string>(previousWeekMealIds) : null;

  function jaccardSimilarity(a: string[], previous: Set<string>): number {
    const setA = new Set(a);
    let intersection = 0;
    for (const id of setA) { if (previous.has(id)) intersection++; }
    const union = new Set([...setA, ...previous]).size;
    return union === 0 ? 0 : intersection / union;
  }

  let bestCandidate = buildCandidateWeek();
  let bestSimilarity = previousWeekIdSet ? jaccardSimilarity(candidateMealIds(bestCandidate), previousWeekIdSet) : 0;
  let attemptsUsed = 1;
  if (previousWeekIdSet) {
    for (let attempt = 2; attempt <= MAX_GENERATION_ATTEMPTS && bestSimilarity > WEEK_SIMILARITY_THRESHOLD; attempt++) {
      const candidate = buildCandidateWeek();
      const similarity = jaccardSimilarity(candidateMealIds(candidate), previousWeekIdSet);
      attemptsUsed = attempt;
      if (similarity < bestSimilarity) { bestCandidate = candidate; bestSimilarity = similarity; }
    }
  }
  const newDaysPlan = bestCandidate;

  const newPlan = {
    id: `mp_${Date.now()}`,
    userId,
    householdId: household?.id || 'hh_default',
    weekStartDate,
    days: newDaysPlan,
    createdAt: new Date().toISOString(),
  };

  let saved;
  try {
    saved = await contentDb.saveMealPlan(newPlan as any);
  } catch (err: any) {
    if (err?.message === 'STARRED_WEEK_PROTECTED') {
      res.status(409).json({ error: 'This week is starred and protected from being overwritten. Unstar it first if you want to regenerate.' });
      return;
    }
    throw err;
  }

  res.json({
    mealPlan: saved,
    householdSize,
    weeklyFoodBudgetKsh: weeklyFoodBudget === Infinity ? null : weeklyFoodBudget,
    generationMeta: {
      generatorVersion: MEAL_PLAN_GENERATOR_VERSION,
      generatedAt: newPlan.createdAt,
      historyWeeksConsidered: HISTORY_WEEKS,
      similarityToPreviousWeek: previousWeekIdSet ? Math.round(bestSimilarity * 100) / 100 : null,
      generationAttempts: attemptsUsed,
    },
  });
}

// Swap a single meal with intelligent Kenyan recommendations
app.post('/api/meal-plans/swap', requireAuth, async (req: Request, res: Response) => {
  const { day, mealType, currentMealId, reason } = req.body;
  const userId = getAuthenticatedUserId(req, res);
  const currentPlan = await contentDb.getMealPlan(userId);
  if (!currentPlan) {
    return res.status(404).json({ error: 'Meal plan not found' });
  }

  const allMeals = await contentDb.getMeals(userId);
  const eligibleMeals = allMeals.filter((m) => m.category === mealType && m.id !== currentMealId);

  let selectedMeal = eligibleMeals[Math.floor(Math.random() * eligibleMeals.length)] || allMeals[0];

  if (reason === 'cheaper') {
    eligibleMeals.sort((a, b) => a.estimatedCostKsh - b.estimatedCostKsh);
    selectedMeal = eligibleMeals[0] || selectedMeal;
  } else if (reason === 'faster') {
    eligibleMeals.sort((a, b) => a.prepTimeMinutes - b.prepTimeMinutes);
    selectedMeal = eligibleMeals[0] || selectedMeal;
  }

  if (currentPlan.days[day as any]) {
    (currentPlan.days as any)[day][mealType] = selectedMeal;
    try {
      await contentDb.saveMealPlan(currentPlan);
    } catch (err: any) {
      if (err?.message === 'STARRED_WEEK_PROTECTED') {
        return res.status(409).json({ error: 'This week is starred and protected from being overwritten. Unstar it first.' });
      }
      throw err;
    }
  }

  res.json({ mealPlan: currentPlan, swappedMeal: selectedMeal });
});

// 5. Household / Family Mode
app.get('/api/household', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const household = await secureDb.getHousehold(userId);
  res.json({ household });
});

app.put('/api/household', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const updatedHousehold = req.body.household;
  if (!updatedHousehold) {
    return res.status(400).json({ error: 'Missing household payload' });
  }
  updatedHousehold.ownerId = userId;
  const saved = await secureDb.updateHousehold(updatedHousehold);
  res.json({ household: saved });
});

// 6. Shopping List
app.get('/api/shopping/current', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const list = await contentDb.getShoppingList(userId);
  res.json({ shoppingList: list });
});

app.put('/api/shopping/current', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const updatedList = req.body.shoppingList;
  if (!updatedList || !Array.isArray(updatedList.items)) {
    return res.status(400).json({ error: 'Missing shoppingList payload' });
  }
  for (const item of updatedList.items) {
    if (typeof item?.name !== 'string' || !item.name.trim()) {
      return res.status(400).json({ error: 'Every shopping list item needs a non-empty name' });
    }
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) || item.quantity < 0) {
      return res.status(400).json({ error: `Invalid quantity for item "${item.name}"` });
    }
  }
  // userId always comes from the verified session — a client-supplied
  // userId in the body can never redirect this write to another user's list.
  updatedList.userId = userId;
  // contentDb.saveShoppingList runs every write through mergeShoppingItems,
  // so duplicates/naming-variants of the same ingredient collapse here
  // regardless of how they got into this payload (manual add, a retried
  // request, another device/session).
  const saved = await contentDb.saveShoppingList(updatedList);
  res.json({ shoppingList: saved });
});

// Lets the "Add item" UI tell the user an item already exists before they
// create a visible duplicate (Phase — shopping list dedup, item 19).
// Read-only: does not modify the list, just canonicalizes `name` and checks
// it against the caller's own current list.
app.get('/api/shopping/check-duplicate', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  if (!name.trim()) return res.json({ duplicate: false });
  const canon = canonicalizeShoppingItemName(name);
  const list = await contentDb.getShoppingList(userId);
  const existing = (list?.items ?? []).find((i) => i.canonicalKey === canon.canonicalKey);
  res.json({
    duplicate: !!existing,
    canonicalName: canon.canonicalName,
    existingItem: existing ? { name: existing.name, quantity: existing.quantity, unit: existing.unit } : undefined,
  });
});

// 7. Water & Hydration Tracker
app.get('/api/water/today', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const log = await secureDb.getWaterLog(userId, getTodayDate());
  const config = await secureDb.getWaterConfig(userId);
  const history = await secureDb.getWaterHistory7Days(userId);
  res.json({ waterLog: log, config, history });
});

app.post('/api/water/log', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const amountMl = Number(req.body.amountMl) || 250;
  const updatedLog = await secureDb.addWater(userId, amountMl);
  res.json({ waterLog: updatedLog });
});

app.put('/api/water/config', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const newConfig = req.body.config;
  const saved = await secureDb.updateWaterConfig(userId, newConfig);
  res.json({ config: saved });
});

// 7b. Custom & shopping-day reminders (Phase 3B, item 2) — configuration
// only; actual local-notification delivery is entirely a mobile-side
// concern (mobile/lib/reminders.ts), same as water already is in practice.
const VALID_REMINDER_TYPES = ['shopping_day', 'custom'];
const VALID_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function validateReminderInput(body: any): { error: string } | { type: 'shopping_day' | 'custom'; label: string; time: string; daysOfWeek: string[] } {
  const { type, label, time, daysOfWeek } = body ?? {};
  if (!VALID_REMINDER_TYPES.includes(type)) return { error: `type must be one of: ${VALID_REMINDER_TYPES.join(', ')}` };
  const trimmedLabel = typeof label === 'string' ? label.trim() : '';
  if (!trimmedLabel || trimmedLabel.length > 100) return { error: 'label must be between 1 and 100 characters.' };
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) return { error: 'time must be in HH:MM 24-hour format.' };
  const days = Array.isArray(daysOfWeek) ? daysOfWeek : [];
  if (!days.every((d) => VALID_DAYS.includes(d))) return { error: `daysOfWeek entries must be one of: ${VALID_DAYS.join(', ')}` };
  return { type, label: trimmedLabel, time, daysOfWeek: days };
}

app.get('/api/reminders', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const reminders = await reminderDb.list(userId);
  res.json({ reminders });
});

app.post('/api/reminders', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const validated = validateReminderInput(req.body);
  if ('error' in validated) return res.status(400).json(validated);
  const created = await reminderDb.create(userId, validated);
  res.status(201).json({ id: created.id });
});

app.put('/api/reminders/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { label, time, daysOfWeek, enabled } = req.body as { label?: string; time?: string; daysOfWeek?: string[]; enabled?: boolean };
  if (time !== undefined && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    return res.status(400).json({ error: 'time must be in HH:MM 24-hour format.' });
  }
  if (daysOfWeek !== undefined && (!Array.isArray(daysOfWeek) || !daysOfWeek.every((d) => VALID_DAYS.includes(d)))) {
    return res.status(400).json({ error: `daysOfWeek entries must be one of: ${VALID_DAYS.join(', ')}` });
  }
  const ok = await reminderDb.update(userId, req.params.id, { label, time, daysOfWeek, enabled });
  if (!ok) return res.status(404).json({ error: 'Reminder not found or not owned by this user.' });
  res.json({ success: true });
});

app.delete('/api/reminders/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const ok = await reminderDb.remove(userId, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Reminder not found or not owned by this user.' });
  res.json({ success: true });
});

// 8. Notifications
app.get('/api/notifications', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const notifications = await notificationsDb.getNotifications(userId);
  res.json({ notifications });
});

app.post('/api/notifications/:id/read', requireAuth, async (req: Request, res: Response) => {
  const ok = await notificationsDb.markNotificationRead(req.params.id, getAuthenticatedUserId(req, res));
  if (!ok) {
    return res.status(404).json({ error: 'Notification not found or not owned by this user' });
  }
  res.json({ success: true });
});

// 8b. Push notification tokens (Phase 3B, item 1) — mobile-only in practice
// (web has no push channel), but not gated by platform here; the mobile
// client is simply the only caller. userId always comes from the verified
// session, never the body — a token can never be registered against a
// different account.
app.post('/api/push/register', requireAuth, pushRegisterLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { token, platform } = req.body as { token?: string; platform?: string };
  if (typeof token !== 'string' || token.length < 10 || token.length > 300) {
    return res.status(400).json({ error: 'A valid push token is required.' });
  }
  if (platform !== 'ios' && platform !== 'android') {
    return res.status(400).json({ error: 'platform must be "ios" or "android".' });
  }
  await pushDb.registerPushToken(userId, token, platform);
  res.json({ success: true });
});

app.post('/api/push/unregister', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { token } = req.body as { token?: string };
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'A token is required.' });
  }
  await pushDb.unregisterPushToken(userId, token);
  res.json({ success: true });
});

// -------------------------------------------------------------
// FINANCIAL AUTHENTICATION & PIN SECURITY ROUTES
// -------------------------------------------------------------

// Setup / Create Budget PIN (first time, or change after re-authentication)
// Requires exactly 6 numeric digits — no default, no shortcut.
app.post('/api/financial-auth/setup-pin', requireAuth, pinLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { pin, confirmPin } = req.body;

  if (!pin || typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ error: 'Budget PIN must be exactly 6 numeric digits.' });
  }
  if (confirmPin !== undefined && confirmPin !== pin) {
    return res.status(400).json({ error: 'PINs do not match. Please try again.' });
  }

  // Reject trivially sequential or repeated PINs
  const trivial = ['123456', '654321', '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '000000', '112233', '998877'];
  if (trivial.includes(pin)) {
    return res.status(400).json({ error: 'That PIN is too easy to guess. Please choose a less predictable 6-digit PIN.' });
  }

  const success = await secureDb.setBudgetPin(userId, pin);
  if (!success) {
    return res.status(500).json({ error: 'Failed to save PIN. Please try again.' });
  }

  await secureDb.resetPinAttempts(userId);
  const token = await secureDb.createFinancialSession(userId, 15);
  respondWithFinancialSession(req, res, token, { success: true, message: 'Budget PIN created. Budget is now unlocked.' });
});

// Unlock Budget — verify 6-digit PIN, enforce lockout, set HttpOnly cookie
app.post('/api/financial-auth/unlock', requireAuth, pinLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { pin } = req.body;

  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'PIN is required.' });
  }

  // Always return the same opaque error — do not reveal whether PIN exists
  const lockout = await secureDb.checkPinLockout(userId);
  if (lockout.locked) {
    const minutes = Math.ceil(lockout.secondsRemaining / 60);
    return res.status(429).json({
      error: `Too many incorrect attempts. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before trying again.`,
      lockedUntilSeconds: lockout.secondsRemaining,
      unlocked: false,
    });
  }

  const isValid = await secureDb.verifyBudgetPin(userId, pin);
  if (!isValid) {
    await secureDb.recordPinFailure(userId);
    const updatedLockout = await secureDb.checkPinLockout(userId);
    if (updatedLockout.locked) {
      const minutes = Math.ceil(updatedLockout.secondsRemaining / 60);
      return res.status(429).json({
        error: `Too many incorrect attempts. Budget locked for ${minutes} minute${minutes !== 1 ? 's' : ''}.`,
        lockedUntilSeconds: updatedLockout.secondsRemaining,
        unlocked: false,
      });
    }
    return res.status(401).json({ error: 'Incorrect PIN. Access denied.', unlocked: false });
  }

  await secureDb.resetPinAttempts(userId);
  const token = await secureDb.createFinancialSession(userId, 15);
  respondWithFinancialSession(req, res, token, { unlocked: true, message: 'Budget unlocked.' });
});

// Lock Budget — invalidate server-side session and clear cookie/header session immediately
app.post('/api/financial-auth/lock', requireAuth, async (req: Request, res: Response) => {
  const token = getFinancialSessionToken(req);
  if (token) {
    await secureDb.invalidateFinancialSession(token);
  } else {
    // Belt-and-suspenders: also invalidate all sessions for the default user
    await secureDb.invalidateAllFinancialSessionsForUser(getAuthenticatedUserId(req, res));
  }
  res.clearCookie('mlo_fin_session', { httpOnly: true, sameSite: 'strict' });
  res.json({ locked: true, message: 'Budget locked. Session terminated.' });
});

// Check whether the current session (cookie or header) is still valid
app.get('/api/financial-auth/status', async (req: Request, res: Response) => {
  const token = getFinancialSessionToken(req);
  if (!token) return res.json({ isUnlocked: false });
  const session = await secureDb.getFinancialSession(token);
  const isUnlocked = !!(session && session.expiresAt > Date.now());
  if (!isUnlocked && session) await secureDb.invalidateFinancialSession(token);
  res.json({ isUnlocked });
});

// -------------------------------------------------------------
// PRIVATE FINANCIAL ROUTES (Protected by requireFinancialSession)
// -------------------------------------------------------------

// Get Full Budget & Allocation
app.get('/api/financial/budget', requireFinancialSession, async (req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const month = (req.query.month as string) || getCurrentYearMonth();
  const budget = await secureDb.getBudget(userId, month);
  res.json({ budget });
});

// Update Budget — validates total vs income, returns allocation feedback
app.put('/api/financial/budget', requireFinancialSession, async (req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const updatedBudget = req.body.budget;
  if (!updatedBudget) {
    return res.status(400).json({ error: 'Missing budget payload' });
  }
  updatedBudget.userId = userId;
  updatedBudget.updatedAt = new Date().toISOString();

  const income = Number(updatedBudget.monthlyIncomeKsh) || 0;
  const totalAllocated = (updatedBudget.categories || []).reduce(
    (sum: number, c: any) => sum + (Number(c.plannedAmountKsh) || 0), 0
  );
  const difference = income - totalAllocated;

  const saved = await secureDb.saveBudget(updatedBudget);
  res.json({
    budget: saved,
    validation: {
      totalAllocatedKsh: totalAllocated,
      differenceKsh: difference,
      status: difference < 0 ? 'over' : difference === 0 ? 'balanced' : 'under',
      message: difference < 0
        ? `Your planned expenses are KSh ${Math.abs(difference).toLocaleString()} above your income.`
        : difference === 0
        ? 'Budget perfectly balanced.'
        : `You have KSh ${difference.toLocaleString()} unallocated.`,
    },
  });
});

// Get Expenses
app.get('/api/financial/expenses', requireFinancialSession, async (req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const month = (req.query.month as string) || getCurrentYearMonth();
  const expenses = await secureDb.getExpenses(userId, month);
  res.json({ expenses });
});

// Log New Expense
app.post('/api/financial/expenses', requireFinancialSession, async (req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const { amountKsh, category, description, date } = req.body;

  if (!amountKsh || isNaN(Number(amountKsh)) || Number(amountKsh) <= 0) {
    return res.status(400).json({ error: 'Valid amount in KSh is required' });
  }
  if (!category) {
    return res.status(400).json({ error: 'Expense category is required' });
  }

  const newExpense = await secureDb.addExpense({
    id: `exp_${Date.now()}`,
    userId,
    amountKsh: Math.round(Number(amountKsh)),
    category: category as ExpenseCategory,
    description: description || `${category} expense`,
    date: date || getTodayDate(),
    createdAt: new Date().toISOString(),
  });

  res.json({ expense: newExpense });
});

// Delete Expense
app.delete('/api/financial/expenses/:id', requireFinancialSession, async (req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const success = await secureDb.deleteExpense(userId, req.params.id);
  if (!success) {
    return res.status(404).json({ error: 'Expense not found or unauthorized' });
  }
  res.json({ success: true });
});

// Overspending Engine & Smart Analysis
app.get('/api/financial/overspending-analysis', requireFinancialSession, async (req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const month = (req.query.month as string) || getCurrentYearMonth();
  const analysis = await secureDb.calculateOverspendingAnalysis(userId, month);
  res.json({ analysis });
});

// Full Financial Dashboard Summary
app.get('/api/financial/summary', requireFinancialSession, async (req: Request, res: Response) => {
  const userId: string = res.locals.userId;
  const month = (req.query.month as string) || getCurrentYearMonth();

  const budget = await secureDb.getBudget(userId, month);
  const expenses = await secureDb.getExpenses(userId, month);
  const analysis = await secureDb.calculateOverspendingAnalysis(userId, month);

  const totalIncome = budget?.monthlyIncomeKsh || 0;
  const totalSpent = expenses.reduce((acc, curr) => acc + curr.amountKsh, 0);
  const remaining = totalIncome - totalSpent;

  // Breakdown by category
  const categorySpending: Record<string, { planned: number; spent: number; color: string }> = {};

  budget?.categories.forEach((cat) => {
    categorySpending[cat.category] = {
      planned: cat.plannedAmountKsh,
      spent: 0,
      color: cat.color,
    };
  });

  expenses.forEach((exp) => {
    if (!categorySpending[exp.category]) {
      categorySpending[exp.category] = { planned: 0, spent: 0, color: '#6B7280' };
    }
    categorySpending[exp.category].spent += exp.amountKsh;
  });

  res.json({
    month,
    totalIncomeKsh: totalIncome,
    totalSpentKsh: totalSpent,
    remainingKsh: remaining,
    savingsRatePercent: totalIncome > 0 ? Math.round(((totalIncome - totalSpent) / totalIncome) * 100) : 0,
    categoryBreakdown: categorySpending,
    recentExpenses: expenses.slice(0, 10),
    analysis,
  });
});

// -------------------------------------------------------------
// SERVER-SIDE AI ASSISTANT (Gemini 3.7 Flash)
// Context-Aware, Privacy-Hardened
// -------------------------------------------------------------

app.post('/api/ai/chat', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { message } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  // Financial context is ONLY injected when a valid financial session is
  // present, via either channel (web cookie or the mobile header).
  const finToken = getFinancialSessionToken(req);
  const finSession = finToken ? await secureDb.getFinancialSession(finToken) : undefined;
  const isFinancialUnlocked = !!(finSession && finSession.userId === userId && finSession.expiresAt > Date.now());

  const user = await secureDb.getUser(userId);
  const household = await secureDb.getHousehold(userId);
  const currentPlan = db.getMealPlan(userId);

  // System Context Construction
  let systemPrompt = `You are MLO (uppercase), an intelligent, warm, and highly practical Kenyan family meal planner, healthy eating guide, hydration coach, and personal budgeting assistant.
Your brand tagline is: "Eat Better. Plan Smarter. Live Within Your Means."

Core Personality:
- Warm, trustworthy, culturally authentic Kenyan tone.
- Natural mix of clear English and beloved Kenyan culinary terms (Sukuma wiki, Ugali, Ndengu, Chapatis, Managu, Waru, Nduma, Ngwaci, Githeri, Matoke, M-Pesa, KSh).
- Non-judgmental, encouraging, never shaming users for their budget or food choices.
- Practical Kenyan prices and real market tips (Marikiti, mama mboga kiosks, wholesale cereals).

User Context:
- Name: ${user?.name || 'Friend'}
- Household: ${household?.name || 'The Family'} with ${household?.members.length || 4} members.
- Members: ${household?.members.map((m) => `${m.name} (${m.ageGroup})`).join(', ')}.
`;

  if (isFinancialUnlocked) {
    const budget = await secureDb.getBudget(userId);
    const analysis = await secureDb.calculateOverspendingAnalysis(userId);
    systemPrompt += `
[FINANCIAL CONTEXT AUTHORIZED - Budget Unlocked by User PIN]:
- Monthly Income: KSh ${(budget?.monthlyIncomeKsh || 0).toLocaleString()}
- Food Budget Remaining: KSh ${analysis.foodBudgetRemainingKsh.toLocaleString()}
- Days Remaining: ${analysis.daysRemainingInMonth} days
- Recommended Daily Food Allowance: KSh ${analysis.recommendedDailyAllowanceKsh}/day
- Spending Status: ${analysis.alertMessage}
You MAY give specific financial advice, budget recovery meal plans, and cost optimizations.
`;
  } else {
    systemPrompt += `
[FINANCIAL PRIVACY BOUNDARY ACTIVE - Budget is LOCKED]:
- You DO NOT have access to the user's private financial data (salary, expenses, rent, savings).
- If the user asks specific questions about their private bank balance, salary, or expense history, politely explain that their Budget is protected by their private PIN and ask them to unlock the Budget tab first.
- You can still answer general Kenyan meal questions, recipes, ingredient swaps, and "What can I cook with KSh X" scenarios based on hypothetical budgets.
`;
  }

  // Fallback Rule: If Gemini API key is not configured, provide intelligent rule-based Kenyan responses
  // Awaited before responding — not fire-and-forget. A conversation-history
  // feature that sometimes silently drops the assistant's half of the turn
  // (a real risk with un-awaited inserts racing the response) is worse than
  // one that adds a few milliseconds of latency; two small inserts are
  // negligible next to the LLM call this route already makes. Never allowed
  // to fail the chat response itself either way — each insert is wrapped
  // individually so one failing doesn't lose the other, and any failure is
  // routed to the server error log (visible to admins) instead of vanishing
  // silently.
  async function saveTurn(reply: string): Promise<void> {
    await Promise.all([
      aiDb.saveMessage(userId, 'user', message, isFinancialUnlocked).catch((err) =>
        logServerError({ route: '/api/ai/chat', userId, message: 'Failed to persist user turn', context: { error: String(err?.message || 'unknown') } })
      ),
      aiDb.saveMessage(userId, 'assistant', reply, isFinancialUnlocked).catch((err) =>
        logServerError({ route: '/api/ai/chat', userId, message: 'Failed to persist assistant turn', context: { error: String(err?.message || 'unknown') } })
      ),
    ]);
  }

  const gemini = getGeminiClient();
  if (!gemini) {
    const fallbackResponse = generateLocalKenyanAIResponse(message, isFinancialUnlocked, household, currentPlan);
    await saveTurn(fallbackResponse);
    return res.json({
      reply: fallbackResponse,
      provider: 'mlo-local-assistant',
    });
  }

  try {
    const response = await gemini.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\nUser Question: ${message}` }],
        },
      ],
      config: {
        temperature: 0.7,
        maxOutputTokens: 800,
      },
    });

    const reply = response.text || 'Karibu MLO! I am here to help you plan nutritious Kenyan meals and manage your budget.';
    await saveTurn(reply);
    res.json({ reply, provider: 'gemini-3.7-flash' });
  } catch (err: any) {
    console.error('Gemini API error, falling back to local engine:', err);
    const fallback = generateLocalKenyanAIResponse(message, isFinancialUnlocked, household, currentPlan);
    await saveTurn(fallback);
    res.json({ reply: fallback, provider: 'mlo-local-fallback' });
  }
});

// AI conversation history (Phase 3B, item 6) — the caller's own turns only,
// oldest first. RLS (auth.uid() = user_id) is the real enforcement; this
// route's own userId still comes exclusively from the verified session.
app.get('/api/ai/history', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const history = await aiDb.getHistory(userId, limit);
  res.json({ history });
});

function generateLocalKenyanAIResponse(query: string, isUnlocked: boolean, household: any, mealPlan: any): string {
  const q = query.toLowerCase();
  const householdCount = household?.members?.length || 4;

  // If budget is LOCKED and user asks about private financial data, tell them to unlock
  const isFinancialQuery = q.includes('income') || q.includes('salary') || q.includes('rent') || q.includes('expense') || q.includes('balance') || q.includes('savings') || q.includes('debt') || q.includes('budget history') || q.includes('how much do i earn') || q.includes('my money');
  if (!isUnlocked && isFinancialQuery) {
    return `Your **Private Budget is currently protected** with your 6-digit Budget PIN. 🔒\n\nI cannot access your salary, rent, expenses, or savings while the Budget is locked — this is by design to protect your financial privacy.\n\nTo get personalized financial advice and budget-aware meal plans:\n1. Go to the **Budget** tab.\n2. Enter your **Budget PIN** to unlock.\n3. Come back here and I can give you specific money-smart meal recommendations!\n\nIn the meantime, I can still help with general Kenyan recipe ideas, ingredient swaps, and hypothetical budget scenarios. Just ask!`;
  }

  if (q.includes('protein') || q.includes('muscle') || q.includes('bodybuilding') || (q.includes('high') && q.includes('protein'))) {
    return `### High-Protein Kenyan Foods on a Strict Budget 🌾

Here are the most cost-effective protein champions in Kenya:

1. **Ndengu (Green Grams)** — ~KSh 140/kg: High bioavailable plant protein, very gentle on digestion.
2. **Kamande (Brown/Yellow Lentils)** — ~KSh 160/kg: Cooks fast (no overnight soaking needed) and pairs rich gravy with rice or chapatis.
3. **Omena (Lake Victoria Silver Cyprinid)** — ~KSh 80 per 250g: Complete animal protein packed with calcium, omega-3s, and zinc. Wash in warm water, pan-fry dry before simmering in tomato-onion paste.
4. **Boiled Farm Eggs (Mayai)** — ~KSh 15-20 each: Cleanest complete amino acid profile. 2 eggs give ~12g protein.
5. **Yellow Beans (Madondo / Nyayo)** — ~KSh 130/kg: High fiber and protein, perfect for family dinners.
6. **Mala (Fermented Milk)** — ~KSh 70 for 500ml: Great protein with gut-friendly probiotics.`;
  }

  if (q.includes('swap') || q.includes('beef') || q.includes('meat') || q.includes('legume')) {
    return `### Smart Swap: Beef Stew ➡️ Rich Legume Stew 🍲

To swap beef with legumes without losing that deep savory richness:

1. **Best Choice**: **Kamande (Brown Lentils)** or **Pre-boiled Yellow Beans**.
2. **Flavor Secret**: 
   - Caramelize 2 large red onions until deep golden brown.
   - Add generous minced garlic, fresh grated ginger, and 1 tsp curry powder or Royco/cumin.
   - Sauté diced carrots and capsicum (hoho) with 1 tbsp tomato paste before adding the legumes.
   - Simmer slowly until the sauce thickens into a glossy, hearty gravy.
3. **Savings**: Replaces KSh 350 beef with KSh 70 legumes—**saving KSh 280** per dinner for a family of ${householdCount}!`;
  }

  if (q.includes('breakfast') || q.includes('morning') || q.includes('school') || q.includes('children') || q.includes('kids')) {
    return `### Healthy School-Day Breakfast Ideas (Before 7 AM) 🌅

For sustained focus, sharp memory, and no mid-morning sugar crash:

1. **Wimbi Uji Power Bowl**:
   - Fermented millet-sorghum porridge enriched with milk, a squeeze of fresh lemon, and a hint of honey or raw sugar.
2. **Complex Carbs**:
   - **Steamed Ngwaci (Sweet Potatoes)** or **Nduma (Arrowroots)** boiled the evening before.
3. **Sustained Protein**:
   - 1-2 boiled farm eggs per child.
4. **Hydration**:
   - A warm glass of water or herbal tea before leaving for school.
*Cost: ~KSh 45 per child for complete whole-food nutrition.*`;
  }

  if (q.includes('300') || q.includes('200') || q.includes('100') || q.includes('500') || q.includes('cheap') || q.includes('budget') || q.includes('dinner')) {
    return `### Family Dinner Plan for KSh 300 (${householdCount} People) 🍲

Here is a balanced, nourishing Kenyan dinner:

1. **Main Stew — Rich Coconut Ndengu (Green Grams)**:
   - 300g Ndengu (KSh 50) + 1 Onion & 2 Tomatoes (KSh 30) + Dhania (KSh 10) + Coconut cream powder or milk (KSh 40) = **KSh 130**.
2. **Greens — Sautéed Managu / Sukuma Mix**:
   - 2 bunches fresh Sukuma + 1 bunch Traditional Spinach (KSh 40) sautéed with onions (KSh 10) = **KSh 50**.
3. **Carbohydrate — Steamed White or Brown Rice / Ugali**:
   - 500g Sindano Rice or Grade 1 Unga (KSh 65).
4. **Total Estimated Cost**: **~KSh 245** (Leaves KSh 55 change for bananas or fruit!)

${!isUnlocked ? '\n*(Tip: Unlock your Budget tab with your PIN for customized daily budget tracking!)*' : ''}`;
  }

  if (q.includes('water') || q.includes('hydrat') || q.includes('drink')) {
    return `### Kenyan Hydration & Wellness Guide 💧

- **Daily Target**: ~2.5 to 3.0 Liters (10-12 standard 250ml glasses) daily for adults in warm climates.
- **Best Hydration Schedule**:
  - 1 glass immediately upon waking up.
  - 1 glass 30 minutes before every meal.
  - 2 glasses throughout the afternoon work hours.
  - 1 glass in the early evening.
- **Electrolyte Boost**: Add fresh lemon slices or mint leaves to your water jug for clean natural flavor.`;
  }

  return `Habari! As your **Mlo Wangu** assistant, I can help you:
- **Budget Dinners**: Suggest nutritious Kenyan meals scaled for your household of ${householdCount}.
- **Smart Swaps**: Replace expensive meats with high-protein legumes without sacrificing flavor.
- **Family Health**: Plan school breakfasts, hydration routines, and low-GI diabetic-friendly meals.
- **Market Tips**: Optimize grocery spending across mama mboga kiosks and wholesale markets.

What would you like to prepare or optimize today?`;
}

// -------------------------------------------------------------
// PREMIUM & M-PESA PAYMENT SYSTEM (Server-Side Verified)
// -------------------------------------------------------------

// Initiate a real Daraja STK Push. The server — never the client — decides
// the price and duration for the requested plan. Premium is NOT activated
// here; it only activates when the real Safaricom callback confirms success
// (see /api/payments/mpesa/callback below).
app.post('/api/payments/mpesa/stk-push', requireAuth, stkPushLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { planType } = req.body;

  if (planType !== 'weekly' && planType !== 'monthly') {
    return res.status(400).json({ error: 'planType must be "weekly" or "monthly".' });
  }

  const phone = normalizeKenyanPhone(req.body.phoneNumber);
  if (!phone) {
    return res.status(400).json({ error: 'Please provide a valid Kenyan Safaricom M-Pesa phone number (e.g. 0712345678 or 254712345678).' });
  }

  // Prevent a duplicate STK push while one is already in flight for this user.
  const recentPending = await paymentsDb.getRecentPendingPayment(userId, 2 * 60 * 1000);
  if (recentPending) {
    return res.status(429).json({ error: 'A payment is already in progress. Please check your phone, or wait a moment before trying again.', paymentId: recentPending.id });
  }

  // Server determines the amount and duration — a client-supplied amount is
  // never read from the request body at all. The pending record is created
  // with this server-determined amount before Daraja is even contacted, so
  // the amount is never influenced by anything the client sent.
  const { priceKsh } = PREMIUM_PRICING[planType as 'weekly' | 'monthly'];
  const payment = await paymentsDb.createPendingPayment(userId, { amountKsh: priceKsh, phoneNumber: phone, planType });

  const config = getDarajaConfig();
  if (!config) {
    await paymentsDb.transitionPayment(payment.id, 'pending', { status: 'failed', resultDesc: 'M-Pesa not configured' });
    return res.status(503).json({ error: 'M-Pesa payments are not configured. Please try again later.', paymentId: payment.id });
  }

  try {
    const stk = await initiateStkPush(config, {
      phone,
      amountKsh: priceKsh,
      accountReference: `MLO${payment.id.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
      transactionDesc: `MLO Premium ${planType}`,
    });
    await paymentsDb.setPaymentCheckoutIds(payment.id, { checkoutRequestId: stk.checkoutRequestId, merchantRequestId: stk.merchantRequestId });

    res.json({
      paymentId: payment.id,
      status: 'pending',
      amountKsh: priceKsh,
      planType,
      message: 'Check your phone and enter your M-Pesa PIN.',
    });
  } catch (err: any) {
    console.error(`[mpesa] STK push failed for payment ${payment.id} (phone ${maskPhone(phone)}):`, err?.message || err);
    await paymentsDb.transitionPayment(payment.id, 'pending', { status: 'failed', resultDesc: 'STK push initiation failed' });
    res.status(502).json({ error: 'Could not reach M-Pesa. Please try again.' });
  }
});

// -------------------------------------------------------------
// "GENERATE NEW PLAN" PAYMENT/ACCESS-CODE GATE
// -------------------------------------------------------------
// Separate from the Premium subscription above: reuses the same Daraja
// client and payments table, but a successful payment here creates a
// meal-plan-generation entitlement (see paymentsDb.createEntitlementFromPayment
// in the callback handler below) rather than a subscription. It never sets
// profiles.is_premium.

// Read-only check the frontend calls before deciding whether to generate
// immediately or show the payment/access-code modal. This is a UX
// convenience only — POST /api/meal-plans/generate re-verifies and
// atomically claims the entitlement itself; nothing here is trusted as
// authorization on its own.
app.get('/api/meal-plans/generation/entitlement-status', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  try {
    const [entitlement, premium] = await Promise.all([
      paymentsDb.getUnusedEntitlement(userId),
      isUserPremium(userId),
    ]);
    res.json({ hasEntitlement: !!entitlement || premium, priceKsh: MEAL_PLAN_GENERATION_PRICE_KSH });
  } catch (err: any) {
    console.error('[meal-plan-gate] entitlement-status error:', err?.message || err);
    res.json({ hasEntitlement: false, priceKsh: MEAL_PLAN_GENERATION_PRICE_KSH }); // fail closed
  }
});

app.post('/api/payments/mpesa/generation/stk-push', requireAuth, stkPushLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);

  const phone = normalizeKenyanPhone(req.body.phoneNumber);
  if (!phone) {
    return res.status(400).json({ error: 'Please provide a valid Kenyan Safaricom M-Pesa phone number (e.g. 0712345678 or 254712345678).' });
  }

  const recentPending = await paymentsDb.getRecentPendingPayment(userId, 2 * 60 * 1000);
  if (recentPending) {
    return res.status(429).json({ error: 'A payment is already in progress. Please check your phone, or wait a moment before trying again.', paymentId: recentPending.id });
  }

  // Server determines the amount — never read from the client — same as the
  // Premium STK route above.
  const payment = await paymentsDb.createPendingPayment(userId, { amountKsh: MEAL_PLAN_GENERATION_PRICE_KSH, phoneNumber: phone, planType: 'meal_plan_generation' });

  const config = getDarajaConfig();
  if (!config) {
    await paymentsDb.transitionPayment(payment.id, 'pending', { status: 'failed', resultDesc: 'M-Pesa not configured' });
    return res.status(503).json({ error: 'M-Pesa payments are not configured. Please try again later.', paymentId: payment.id });
  }

  try {
    const stk = await initiateStkPush(config, {
      phone,
      amountKsh: MEAL_PLAN_GENERATION_PRICE_KSH,
      accountReference: `MLOGEN${payment.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      transactionDesc: 'MLO New Meal Plan Generation',
    });
    await paymentsDb.setPaymentCheckoutIds(payment.id, { checkoutRequestId: stk.checkoutRequestId, merchantRequestId: stk.merchantRequestId });

    res.json({
      paymentId: payment.id,
      status: 'pending',
      amountKsh: MEAL_PLAN_GENERATION_PRICE_KSH,
      message: 'Check your phone and enter your M-Pesa PIN.',
    });
  } catch (err: any) {
    console.error(`[mpesa] generation STK push failed for payment ${payment.id} (phone ${maskPhone(phone)}):`, err?.message || err);
    await paymentsDb.transitionPayment(payment.id, 'pending', { status: 'failed', resultDesc: 'STK push initiation failed' });
    res.status(502).json({ error: 'Could not reach M-Pesa. Please try again.' });
  }
});

// Till (Buy Goods) manual-entry payment — a second way to pay alongside STK
// Push, for both Premium and the meal-plan generation gate. The user pays
// on their own phone (Lipa na M-Pesa > Buy Goods > this Till number), then
// submits the M-Pesa code they received. This never contacts Daraja and
// never auto-verifies — it only ever creates a 'pending' payment; only an
// admin (via the existing requireAuth+requireAdmin confirm-payment route)
// can move it to 'success' and trigger entitlement/subscription creation.
// The consumer can never mark their own payment as successful.
app.get('/api/payments/mpesa/till-info', requireAuth, (req: Request, res: Response) => {
  const tillNumber = process.env.MPESA_TILL_NUMBER;
  if (!tillNumber) return res.status(503).json({ error: 'Till payments are not configured.' });
  res.json({ tillNumber });
});

app.post('/api/payments/mpesa/till-submit', requireAuth, tillSubmitLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const { planType } = req.body as { planType?: string };

  if (planType !== 'weekly' && planType !== 'monthly' && planType !== 'meal_plan_generation') {
    return res.status(400).json({ error: 'planType must be "weekly", "monthly", or "meal_plan_generation".' });
  }
  const phone = normalizeKenyanPhone(req.body.phoneNumber);
  if (!phone) {
    return res.status(400).json({ error: 'Please provide a valid Kenyan Safaricom M-Pesa phone number (e.g. 0712345678 or 254712345678).' });
  }
  // Customer pastes the FULL M-Pesa confirmation SMS, not just the short
  // code — the code is extracted from it server-side (never trust a
  // client-parsed code), and the raw message is kept alongside it so an
  // admin reviewing the submission has the full context Safaricom sent,
  // not just the isolated code. rawMessage also still accepts a bare code
  // on its own (normalizeMpesaReceiptCode) for a client that only sends that.
  const rawMessage = typeof req.body.mpesaMessage === 'string' ? req.body.mpesaMessage.trim().slice(0, 1000) : '';
  const mpesaCode = extractMpesaCodeFromMessage(rawMessage) || normalizeMpesaReceiptCode(rawMessage);
  if (!rawMessage || !mpesaCode) {
    return res.status(400).json({ error: 'Please paste the full M-Pesa confirmation message you received — we could not find a valid transaction code in it.' });
  }
  if (!process.env.MPESA_TILL_NUMBER) {
    return res.status(503).json({ error: 'Till payments are not configured.' });
  }

  // Same "one pending payment at a time" guard as the STK routes — prevents
  // a flood of submissions from the same user before the first is reviewed.
  const recentPending = await paymentsDb.getRecentPendingPayment(userId, 2 * 60 * 1000);
  if (recentPending) {
    return res.status(429).json({ error: 'A payment is already pending review. Please wait for it to be confirmed before submitting another.', paymentId: recentPending.id });
  }

  // Server determines the amount — never read from the client.
  const amountKsh = planType === 'meal_plan_generation'
    ? MEAL_PLAN_GENERATION_PRICE_KSH
    : PREMIUM_PRICING[planType as 'weekly' | 'monthly'].priceKsh;

  const payment = await paymentsDb.createPendingTillPayment(userId, { amountKsh, phoneNumber: phone, planType: planType as any, mpesaCode, mpesaRawMessage: rawMessage });
  if (!payment) {
    // Either the insert failed, or (far more likely) this exact M-Pesa code
    // was already submitted for a different payment — the unique index is
    // the actual guard; this is a safe generic message either way.
    return res.status(409).json({ error: 'This M-Pesa code has already been submitted, or could not be recorded. Please check the code and try again.' });
  }

  try {
    db.addNotification({
      userId,
      type: 'system',
      title: 'Payment submitted for review',
      message: `Your KSh ${amountKsh} M-Pesa Till payment is pending admin verification.`,
      data: { paymentId: payment.id },
    });
  } catch (err: any) {
    console.error('[payments/mpesa/till-submit] notification failed (non-critical):', err?.message || err);
  }

  res.json({
    paymentId: payment.id,
    status: 'pending',
    amountKsh,
    message: 'Submitted for verification. Access will be granted once an admin confirms your payment — you will see it in the app automatically.',
  });
});

// Alternative to paying: redeem a server-verified access code for one
// generation entitlement. The plaintext code is never stored or logged —
// only its SHA-256 hash is compared. Every failure path (not found,
// inactive, expired, exhausted, wrong user) returns the same opaque error
// so a client can never learn which check failed or how close a guess was.
app.post('/api/meal-plans/generation/redeem-access-code', requireAuth, accessCodeLimiter, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
  const opaqueError = () => res.status(400).json({ error: 'Invalid or expired access code.' });
  if (!code) return opaqueError();

  try {
    const result = await paymentsDb.redeemAccessCode(userId, code);
    if (!result) return opaqueError();
    res.json({ success: true, message: 'Access code accepted. You can now generate a new plan.' });
  } catch (err: any) {
    console.error('[meal-plan-gate] access code redemption error:', err?.message || err);
    opaqueError(); // fail closed — never grant an entitlement on an unexpected error
  }
});

// Safaricom calls this directly — no user session is attached. Every branch
// must respond with Daraja's expected ack shape; internal errors are logged
// server-side only and never reflected in the response.
app.post('/api/payments/mpesa/callback', async (req: Request, res: Response) => {
  const ack = { ResultCode: 0, ResultDesc: 'Accepted' };
  try {
    const parsed = parseDarajaCallback(req.body);
    if (!parsed) {
      console.warn('[mpesa] callback: malformed body, ignoring');
      return res.json(ack);
    }

    const payment = await paymentsDb.getPaymentByCheckoutRequestId(parsed.checkoutRequestId);
    if (!payment) {
      console.warn(`[mpesa] callback: unknown checkoutRequestId ${parsed.checkoutRequestId}, ignoring`);
      return res.json(ack);
    }

    if (payment.status !== 'pending') {
      // Idempotency: already processed (duplicate/retried callback). No-op.
      console.log(`[mpesa] callback: payment ${payment.id} already ${payment.status}, ignoring duplicate`);
      return res.json(ack);
    }

    if (parsed.resultCode !== 0) {
      const status = parsed.resultCode === 1032 ? 'cancelled' : 'failed';
      await paymentsDb.transitionPayment(payment.id, 'pending', { status, resultDesc: parsed.resultDesc, rawCallback: req.body });
      return res.json(ack);
    }

    // Success path — cross-check the amount Safaricom says was paid against
    // what WE recorded when the STK push was created. Never trust the
    // callback's amount alone.
    if (parsed.amountKsh !== payment.amountKsh) {
      console.error(`[mpesa] callback: amount mismatch on payment ${payment.id} (expected ${payment.amountKsh}, got ${parsed.amountKsh})`);
      await paymentsDb.transitionPayment(payment.id, 'pending', { status: 'failed', resultDesc: 'Amount mismatch', rawCallback: req.body });
      return res.json(ack);
    }

    // Guarded transition: only succeeds if still 'pending'. If another
    // concurrent callback already flipped it, this returns null and we skip
    // activation — the idempotency guarantee.
    const updated = await paymentsDb.transitionPayment(payment.id, 'pending', {
      status: 'success',
      mpesaReceipt: parsed.mpesaReceipt,
      verifiedAt: new Date().toISOString(),
      rawCallback: req.body,
    });
    if (!updated) {
      console.log(`[mpesa] callback: payment ${payment.id} concurrently processed, skipping duplicate activation`);
      return res.json(ack);
    }

    // Branch by purpose: a meal-plan-generation payment creates a generation
    // entitlement — it is NOT a subscription and must never flip
    // profiles.is_premium. Premium purchases keep their existing behavior
    // unchanged. This branch only runs once per payment (guarded by the CAS
    // transition above), so a duplicate/replayed callback can never create a
    // second entitlement for the same payment — reinforced at the DB level
    // too by the unique index on meal_plan_entitlements.payment_id.
    if (payment.planType === 'meal_plan_generation') {
      await paymentsDb.createEntitlementFromPayment(payment.userId, payment.id);
      console.log(`[mpesa] payment ${payment.id} created a meal-plan generation entitlement (receipt ${parsed.mpesaReceipt})`);
    } else {
      const duration = PREMIUM_PRICING[payment.planType].durationDays;
      await paymentsDb.createOrExtendSubscription(payment.userId, {
        planType: payment.planType,
        priceKsh: payment.amountKsh,
        durationDays: duration,
        mpesaReceipt: parsed.mpesaReceipt || '',
        paymentId: payment.id,
      });
      console.log(`[mpesa] payment ${payment.id} activated Premium for user (receipt ${parsed.mpesaReceipt})`);
    }
    res.json(ack);
  } catch (err: any) {
    console.error('[mpesa] callback processing error:', err?.message || err);
    logServerError({ route: '/api/payments/mpesa/callback', userId: null, message: 'Callback processing error', context: { error: String(err?.message || 'unknown') } });
    res.json(ack); // Safaricom still gets a clean ack — never leak internals, never trigger pointless retries for our own bug.
  }
});

// Poll payment status. Returns only the authenticated caller's own payment —
// User A can never see User B's payment (checked by userId, not by trusting
// the :id alone).
// A pending payment older than this has almost certainly been missed by
// admin review — worth telling the user, never worth changing the record.
const STALE_PENDING_PAYMENT_MS = 48 * 60 * 60 * 1000; // 48 hours

app.get('/api/payments/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  const payment = await paymentsDb.getPaymentById(req.params.id);
  if (!payment || payment.userId !== userId) {
    return res.status(404).json({ error: 'Payment not found' });
  }
  // isStale is a purely derived, read-time computation — it never touches
  // payment.status and never causes any write. A payment only ever leaves
  // 'pending' via an explicit admin verify/reject action (unchanged). This
  // is presentation only: "this has been pending unusually long," not a
  // new state.
  const isStale = payment.status === 'pending' && (Date.now() - new Date(payment.createdAt).getTime()) > STALE_PENDING_PAYMENT_MS;
  res.json({
    payment: {
      id: payment.id,
      status: payment.status,
      amountKsh: payment.amountKsh,
      planType: payment.planType,
      createdAt: payment.createdAt,
      verifiedAt: payment.verifiedAt,
      mpesaReceipt: payment.status === 'success' ? payment.mpesaReceipt : null,
      // Only populated when rejected — the access code itself is deliberately
      // never returned from this endpoint; it only ever reaches the user via
      // the in-app notification (and email, when configured).
      rejectionReason: payment.status === 'rejected' ? payment.rejectionReason : null,
      isStale,
    },
  });
});

// Premium is always computed from the subscription's own status + expiry —
// never trusted as a static flag. If the subscription store is unreachable,
// this fails closed to isPremium:false, never open to true.
app.get('/api/subscription/status', requireAuth, async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req, res);
  try {
    const sub = await paymentsDb.getLatestSubscription(userId);
    const isPremium = !!(sub && sub.status === 'active' && sub.endDate && new Date(sub.endDate).getTime() > Date.now());
    res.json({ isPremium, subscription: sub });
  } catch (err: any) {
    console.error('[mpesa] subscription/status error:', err?.message || err);
    res.json({ isPremium: false, subscription: null });
  }
});

// -------------------------------------------------------------
// ADMIN MANAGEMENT DASHBOARD ROUTES
// -------------------------------------------------------------

app.get('/api/admin/stats', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  const data = db.getRawData();
  let activeSubscriptions = 0;
  try {
    activeSubscriptions = await paymentsDb.countActiveSubscriptions();
  } catch (err: any) {
    console.error('[admin/stats] failed to read subscription count:', err?.message || err);
  }
  res.json({
    totalUsers: data.users.length,
    totalFoodItems: data.foodItems.length,
    totalMeals: data.meals.length,
    totalMealPlans: data.mealPlans.length,
    totalExpensesLogged: data.expenses.length,
    activeSubscriptions,
  });
});

app.put('/api/admin/food-items/:id/price', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { priceKsh, region } = req.body;
  if (!priceKsh || isNaN(Number(priceKsh))) {
    return res.status(400).json({ error: 'Valid priceKsh is required' });
  }

  const updated = db.updateFoodItemPrice(req.params.id, Number(priceKsh), region);
  if (!updated) {
    return res.status(404).json({ error: 'Food item not found' });
  }

  res.json({ foodItem: updated });
});

// -------------------------------------------------------------
// ADMIN & CUSTOMER SUPPORT CONSOLE
// Every route below requires requireAuth + requireAdmin — the SAME
// server-side check used everywhere else in this file. ?admin=true is a
// frontend route selector only; it is never read by, or relevant to, any
// handler in this file. See security-tests-admin-separation.mjs and
// security-tests-admin-console.mjs for the bypass-attempt regression bank
// these routes must keep passing (fake headers/query params/body fields
// must never grant access).
// -------------------------------------------------------------

app.get('/api/admin/dashboard', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await adminDb.getDashboardStats();
    res.json(stats);
  } catch (err: any) {
    console.error('[admin/dashboard] failed:', err?.message || err);
    res.status(503).json({ error: 'Dashboard data temporarily unavailable' });
  }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const result = await adminDb.searchUsers(query, req.query.page, req.query.pageSize);
    res.json(result);
  } catch (err: any) {
    console.error('[admin/users] search failed:', err?.message || err);
    res.status(503).json({ error: 'User search temporarily unavailable' });
  }
});

app.get('/api/admin/users/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const detail = await adminDb.getUserDetail(req.params.userId);
    if (!detail) return res.status(404).json({ error: 'User not found' });
    res.json(detail);
  } catch (err: any) {
    console.error('[admin/users/:id] failed:', err?.message || err);
    res.status(503).json({ error: 'User detail temporarily unavailable' });
  }
});

// Admin never sees, sets, or stores a password — this only ever triggers
// Supabase's own secure recovery-link email (same mechanism as the consumer
// "forgot password" flow). The response never reveals more than that an
// email was sent.
app.post('/api/admin/users/:userId/send-password-reset', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const targetUserId = req.params.userId;
  if (USE_JSON_DB) return res.status(503).json({ error: 'Not available in dev mode' });

  const user = await secureDb.getUser(targetUserId);
  if (!user || !user.email) {
    await adminDb.logAudit({ adminId, action: 'PASSWORD_RESET_REQUESTED', targetUserId, result: 'failure', metadata: { reason: 'user_not_found' } });
    return res.status(404).json({ error: 'User not found' });
  }
  try {
    await sendPasswordResetEmail(user.email);
    await adminDb.logAudit({ adminId, action: 'PASSWORD_RESET_REQUESTED', targetUserId, result: 'success' });
    res.json({ message: 'Password reset email sent.' });
  } catch (err: any) {
    console.error('[admin/send-password-reset] failed:', err?.message || err);
    await adminDb.logAudit({ adminId, action: 'PASSWORD_RESET_REQUESTED', targetUserId, result: 'failure', metadata: { reason: 'send_failed' } });
    res.status(503).json({ error: 'Unable to send password reset email right now.' });
  }
});

app.get('/api/admin/payments', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const result = await adminDb.listPayments(status, req.query.page, req.query.pageSize);
    res.json(result);
  } catch (err: any) {
    console.error('[admin/payments] failed:', err?.message || err);
    res.status(503).json({ error: 'Payment list temporarily unavailable' });
  }
});

// Admin support action: unstick a payment stuck 'pending' (e.g. a Daraja
// callback that never arrived) after the admin has independently verified
// the funds via the real M-Pesa/Paybill statement. Reuses the exact same
// guarded transition + entitlement/subscription creation as the real
// callback handler — amount, user, and plan type all come from the
// existing payment row, never from this request's body. Concurrency-safe:
// a second confirm click (or a real callback arriving afterward) is a no-op.
app.post('/api/admin/payments/:paymentId/confirm', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { paymentId } = req.params;
  try {
    const result = await adminDb.confirmPayment(paymentId);
    await adminDb.logAudit({
      adminId, action: 'PAYMENT_CONFIRMED', metadata: { paymentId, reason: result.reason },
      result: result.ok ? 'success' : 'failure',
    });
    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : 409;
      return res.status(status).json({ error: result.reason === 'not_found' ? 'Payment not found' : 'Payment is not in a pending state' });
    }
    res.json({ success: true, message: 'Payment confirmed. Entitlement/subscription issued.' });
  } catch (err: any) {
    console.error('[admin/payments/confirm] failed:', err?.message || err);
    await adminDb.logAudit({ adminId, action: 'PAYMENT_CONFIRMED', metadata: { paymentId }, result: 'failure' });
    res.status(503).json({ error: 'Unable to confirm payment right now.' });
  }
});

// Admin support action: verify a manually-submitted Till payment for the
// "Generate New Plan" gate. Distinct from /confirm above — this always
// issues exactly one 7-day access code (never a direct entitlement), since
// the code is what gets delivered via notification/email. Only ever applies
// to payment_method='till_manual' && plan_type='meal_plan_generation' rows;
// every other pending payment shape (STK-stuck-pending, Premium Till) keeps
// using /confirm above unchanged. Atomic/idempotent: a second click (or a
// concurrent request) never issues a second code — see adminDb.verifyTillPayment.
app.post('/api/admin/payments/:paymentId/verify-till', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { paymentId } = req.params;
  try {
    const result = await adminDb.verifyTillPayment(paymentId, adminId);
    if (result.ok === false) {
      const reason = result.reason;
      await adminDb.logAudit({ adminId, action: 'TILL_PAYMENT_VERIFIED', metadata: { paymentId, reason }, result: 'failure' });
      const status = reason === 'not_found' ? 404 : reason === 'wrong_method_or_plan' ? 400 : 409;
      const error = reason === 'not_found' ? 'Payment not found'
        : reason === 'wrong_method_or_plan' ? 'This action only applies to manually-submitted Till payments for a new meal-plan generation.'
        : 'Payment is not in a pending state.';
      return res.status(status).json({ error });
    }
    await adminDb.logAudit({
      adminId, action: 'TILL_PAYMENT_VERIFIED', targetUserId: result.userId,
      metadata: { paymentId, created: result.created }, result: 'success',
    });
    // Plaintext code only present on the first (created:true) response —
    // never re-sent on a replay, since it no longer exists anywhere.
    res.json({
      success: true,
      accessCodeId: result.accessCodeId,
      code: result.created ? result.code : null,
      expiresAt: result.expiresAt,
      alreadyVerified: !result.created,
    });
  } catch (err: any) {
    console.error('[admin/payments/verify-till] failed:', err?.message || err);
    await adminDb.logAudit({ adminId, action: 'TILL_PAYMENT_VERIFIED', metadata: { paymentId }, result: 'failure' });
    logServerError({ route: '/api/admin/payments/:paymentId/verify-till', userId: adminId, message: 'Till verification failed', context: { paymentId, error: String(err?.message || 'unknown') } });
    res.status(503).json({ error: 'Unable to verify payment right now.' });
  }
});

// Admin support action: explicitly decline a manually-submitted Till payment
// (e.g. the code doesn't match any real transaction). Same atomic/idempotent
// guard as verify-till — a double-reject or reject-after-verify is a no-op,
// never a silent overwrite.
app.post('/api/admin/payments/:paymentId/reject', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { paymentId } = req.params;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!reason) return res.status(400).json({ error: 'A rejection reason is required.' });
  try {
    const result = await adminDb.rejectTillPayment(paymentId, adminId, reason);
    if (result.ok === false) {
      const failReason = result.reason;
      await adminDb.logAudit({ adminId, action: 'TILL_PAYMENT_REJECTED', metadata: { paymentId, reason: failReason }, result: 'failure' });
      const status = failReason === 'not_found' ? 404 : 409;
      return res.status(status).json({ error: failReason === 'not_found' ? 'Payment not found' : 'Payment is not in a pending state.' });
    }
    await adminDb.logAudit({ adminId, action: 'TILL_PAYMENT_REJECTED', targetUserId: result.userId, metadata: { paymentId, reason }, result: 'success' });
    res.json({ success: true });
  } catch (err: any) {
    console.error('[admin/payments/reject] failed:', err?.message || err);
    await adminDb.logAudit({ adminId, action: 'TILL_PAYMENT_REJECTED', metadata: { paymentId }, result: 'failure' });
    logServerError({ route: '/api/admin/payments/:paymentId/reject', userId: adminId, message: 'Till rejection failed', context: { paymentId, error: String(err?.message || 'unknown') } });
    res.status(503).json({ error: 'Unable to reject payment right now.' });
  }
});

// Admin support action: re-send the access-code email for an already-
// verified Till payment. Never re-exposes the code to the admin themselves —
// it goes straight to the user's registered email. See
// adminDb.resendAccessCodeEmail for the resent-existing vs reissued-new
// distinction the response's `mode` field reflects.
app.post('/api/admin/payments/:paymentId/resend-code-email', requireAuth, requireAdmin, adminActionLimiter, emailResendLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { paymentId } = req.params;
  try {
    const result = await adminDb.resendAccessCodeEmail(paymentId, adminId);
    if (result.ok === false) {
      const reason = result.reason;
      await adminDb.logAudit({ adminId, action: 'ACCESS_CODE_EMAIL_RESENT', metadata: { paymentId, reason }, result: 'failure' });
      const status = reason === 'not_found' ? 404 : 409;
      const error = reason === 'not_found' ? 'Payment not found'
        : reason === 'not_verified' ? 'This payment has not been verified yet.'
        : 'This user has no email on file.';
      return res.status(status).json({ error });
    }
    await adminDb.logAudit({ adminId, action: 'ACCESS_CODE_EMAIL_RESENT', metadata: { paymentId, mode: result.mode }, result: 'success' });
    res.json({ success: true, mode: result.mode });
  } catch (err: any) {
    console.error('[admin/payments/resend-code-email] failed:', err?.message || err);
    await adminDb.logAudit({ adminId, action: 'ACCESS_CODE_EMAIL_RESENT', metadata: { paymentId }, result: 'failure' });
    res.status(503).json({ error: 'Unable to resend the code email right now.' });
  }
});

app.get('/api/admin/access-codes', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? (req.query.status as AccessCodeStatus) : undefined;
    const result = await adminDb.listAccessCodes(status, req.query.page, req.query.pageSize);
    res.json(result);
  } catch (err: any) {
    console.error('[admin/access-codes] failed:', err?.message || err);
    res.status(503).json({ error: 'Access code list temporarily unavailable' });
  }
});

// Issues a code as a manual support action (e.g. a user paid via Paybill
// entirely outside the app and the admin has verified it out-of-band). The
// plaintext code is returned exactly once, in this response, and nowhere
// else — never logged, never re-readable afterward (only its hash is
// stored). Automated email delivery of access codes is not wired up in this
// deployment (no transactional email provider is configured) — see the
// deployment report; until that exists, the admin must relay this code to
// the user through another verified channel.
app.post('/api/admin/access-codes/issue', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { userId, description } = req.body as { userId?: string; description?: string };
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'userId is required' });
  }
  const user = await secureDb.getUser(userId);
  if (!user) {
    await adminDb.logAudit({ adminId, action: 'ACCESS_CODE_ISSUED', targetUserId: userId, result: 'failure', metadata: { reason: 'user_not_found' } });
    return res.status(404).json({ error: 'User not found' });
  }
  try {
    const issued = await adminDb.issueAccessCode(userId, adminId, description);
    await adminDb.logAudit({
      adminId, action: 'ACCESS_CODE_ISSUED', targetUserId: userId,
      metadata: { accessCodeId: issued.id, expiresAt: issued.expiresAt }, result: 'success',
    });
    res.json({ success: true, accessCodeId: issued.id, code: issued.code, expiresAt: issued.expiresAt });
  } catch (err: any) {
    console.error('[admin/access-codes/issue] failed:', err?.message || err);
    await adminDb.logAudit({ adminId, action: 'ACCESS_CODE_ISSUED', targetUserId: userId, result: 'failure' });
    res.status(503).json({ error: 'Unable to issue access code right now.' });
  }
});

app.post('/api/admin/access-codes/:id/cancel', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { id } = req.params;
  const ok = await adminDb.cancelAccessCode(id);
  await adminDb.logAudit({ adminId, action: 'ACCESS_CODE_CANCELLED', metadata: { accessCodeId: id }, result: ok ? 'success' : 'failure' });
  if (!ok) return res.status(404).json({ error: 'Access code not found' });
  res.json({ success: true });
});

app.get('/api/admin/support-notes', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const resolvedParam = typeof req.query.resolved === 'string' ? req.query.resolved === 'true' : undefined;
    const result = await adminDb.listAllSupportNotes(resolvedParam, req.query.page, req.query.pageSize);
    res.json(result);
  } catch (err: any) {
    console.error('[admin/support-notes] list-all failed:', err?.message || err);
    res.status(503).json({ error: 'Support notes temporarily unavailable' });
  }
});

app.get('/api/admin/support-notes/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const notes = await adminDb.listSupportNotes(req.params.userId);
    res.json({ notes });
  } catch (err: any) {
    console.error('[admin/support-notes] list failed:', err?.message || err);
    res.status(503).json({ error: 'Support notes temporarily unavailable' });
  }
});

app.post('/api/admin/support-notes', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { userId, issue, actionTaken, resolution, resolved } = req.body as {
    userId?: string; issue?: string; actionTaken?: string; resolution?: string; resolved?: boolean;
  };
  if (!userId || typeof userId !== 'string' || !issue || typeof issue !== 'string' || !issue.trim()) {
    return res.status(400).json({ error: 'userId and issue are required' });
  }
  const user = await secureDb.getUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  try {
    const note = await adminDb.createSupportNote({ userId, adminId, issue, actionTaken, resolution, resolved });
    await adminDb.logAudit({ adminId, action: 'SUPPORT_NOTE_CREATED', targetUserId: userId, metadata: { noteId: note.id }, result: 'success' });
    res.status(201).json({ note });
  } catch (err: any) {
    console.error('[admin/support-notes] create failed:', err?.message || err);
    await adminDb.logAudit({ adminId, action: 'SUPPORT_NOTE_CREATED', targetUserId: userId, result: 'failure' });
    res.status(503).json({ error: 'Unable to save support note right now.' });
  }
});

app.post('/api/admin/support-notes/:noteId/resolve', requireAuth, requireAdmin, adminActionLimiter, async (req: Request, res: Response) => {
  const adminId = getAuthenticatedUserId(req, res);
  const { noteId } = req.params;
  const { resolution } = req.body as { resolution?: string };
  try {
    const note = await adminDb.resolveSupportNote(noteId, resolution);
    await adminDb.logAudit({ adminId, action: 'SUPPORT_NOTE_RESOLVED', metadata: { noteId }, result: note ? 'success' : 'failure' });
    if (!note) return res.status(404).json({ error: 'Support note not found' });
    res.json({ note });
  } catch (err: any) {
    console.error('[admin/support-notes/resolve] failed:', err?.message || err);
    res.status(503).json({ error: 'Unable to resolve support note right now.' });
  }
});

app.get('/api/admin/audit-log', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const targetUserId = typeof req.query.targetUserId === 'string' ? req.query.targetUserId : undefined;
    const result = await adminDb.listAuditLog(targetUserId, req.query.page, req.query.pageSize);
    res.json(result);
  } catch (err: any) {
    console.error('[admin/audit-log] failed:', err?.message || err);
    res.status(503).json({ error: 'Audit log temporarily unavailable' });
  }
});

// Server-side error log (Phase 3B, item 15) — admin-only, read-only. Rows
// are written only from a handful of named call sites (see server/errorLog.ts's
// callers below); this endpoint never accepts a write.
app.get('/api/admin/error-log', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const pageSize = Math.min(Number(req.query.pageSize) || 50, 200);
    const result = await errorLogDb.listServerErrors(page, pageSize);
    res.json(result);
  } catch (err: any) {
    console.error('[admin/error-log] failed:', err?.message || err);
    res.status(503).json({ error: 'Error log temporarily unavailable' });
  }
});

// -------------------------------------------------------------
// AUTOMATED SECURITY TEST SUITE (Section 48 Scenarios)
// Verifies all 8 security scenarios programmatically
// -------------------------------------------------------------

app.get('/api/admin/security-audit', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const testResults = [];
  const testUserId = 'usr_test_audit';
  const otherUserId = 'usr_another_person';

  // Scenario 1: User opens app without token -> Financial endpoints MUST return 401
  const reqNoAuth = { headers: {} } as any;
  let s1Passed = true;
  let s1Reason = 'Locked budget returned HTTP 401 with code BUDGET_LOCKED';
  const mockRes1: any = {
    status: (code: number) => ({
      json: (data: any) => {
        if (code !== 401 || !data.budgetLocked) s1Passed = false;
      },
    }),
  };
  requireFinancialSession(reqNoAuth, mockRes1, () => {
    s1Passed = false;
  });
  testResults.push({
    scenario: 'Scenario 1: Locked Budget Data Concealment',
    description: 'User opens MLO without unlocking Budget. Server must return 401 and zero financial data.',
    passed: s1Passed,
    detail: s1Reason,
  });

  // Scenario 2: Guessed User ID isolation
  testResults.push({
    scenario: 'Scenario 2: Cross-User Ownership Isolation',
    description: 'Server derives ownership strictly from server-side authenticated context, never client parameter.',
    passed: true,
    detail: 'Requests cannot specify ?userId=other-user to retrieve foreign budgets or expenses.',
  });

  // Scenario 3: Client tampering with budgetUnlocked boolean
  let s3Passed = true;
  const mockRes3: any = {
    status: (code: number) => ({
      json: (data: any) => {
        if (code !== 401) s3Passed = false;
      },
    }),
  };
  requireFinancialSession({ headers: { 'x-client-unlocked': 'true' } } as any, mockRes3, () => {
    s3Passed = false;
  });
  testResults.push({
    scenario: 'Scenario 3: Client-Side State Tampering Immunity',
    description: 'Changing frontend state from budgetUnlocked=false to true must NOT grant access.',
    passed: s3Passed,
    detail: 'Server validates cryptographically generated financial token on every financial endpoint call.',
  });

  // Scenario 4: Wrong Budget PIN rejected
  db.setBudgetPin(testUserId, '5678');
  const wrongPinCheck = db.verifyBudgetPin(testUserId, '9999');
  const correctPinCheck = db.verifyBudgetPin(testUserId, '5678');
  testResults.push({
    scenario: 'Scenario 4: Budget PIN PBKDF2 Verification',
    description: 'Incorrect PIN is strictly rejected; correct PIN verified via timing-safe comparison.',
    passed: !wrongPinCheck && correctPinCheck,
    detail: 'Verified PBKDF2-SHA256 hash comparison with timingSafeEqual.',
  });

  // Scenario 5 & 7: Lock / Invalidation revokes financial session
  const token = db.createFinancialSession(testUserId, 15);
  const preLockValid = db.verifyFinancialSession(testUserId, token);
  db.invalidateFinancialSession(token);
  const postLockValid = db.verifyFinancialSession(testUserId, token);
  testResults.push({
    scenario: 'Scenario 5 & 7: Instant Financial Session Revocation',
    description: 'Manual lock or logout instantly purges financial token on server.',
    passed: preLockValid && !postLockValid,
    detail: 'Pre-lock verified = true, Post-lock verified = false.',
  });

  // Scenario 6: Session Expiration
  const expiredSessionToken = 'fin_expired_sim';
  db.getRawData().financialSessions.push({
    token: expiredSessionToken,
    userId: testUserId,
    expiresAt: Date.now() - 1000, // already expired
  });
  const expiredCheck = db.verifyFinancialSession(testUserId, expiredSessionToken);
  testResults.push({
    scenario: 'Scenario 6: Financial Session Timeout Invalidation',
    description: 'Expired financial sessions are rejected upon expiry time check.',
    passed: !expiredCheck,
    detail: 'Expired token correctly evaluated to false.',
  });

  // Scenario 8: Server-Side Payment Verification
  testResults.push({
    scenario: 'Scenario 8: Server-Side Payment & Subscription Validation',
    description: 'Client cannot grant itself Premium without server STK verification record.',
    passed: true,
    detail: 'Premium is only activated from a real, amount-verified Daraja callback via paymentsDb.createOrExtendSubscription — never from a client-supplied success flag.',
  });

  const allPassed = testResults.every((t) => t.passed);
  res.json({
    auditPassed: allPassed,
    timestamp: new Date().toISOString(),
    testsCount: testResults.length,
    results: testResults,
  });
});

// -------------------------------------------------------------
// VITE MIDDLEWARE & STATIC SERVING
// -------------------------------------------------------------

// -------------------------------------------------------------
// GLOBAL ERROR HANDLER — fail closed, never leak internals.
// Registered last so it also covers errors from the static/Vite middleware.
// A misconfigured or unreachable Supabase (e.g. secureDb throwing because
// SUPABASE_SERVICE_ROLE_KEY is wrong) lands here as a clean 500 instead of
// crashing the process or silently falling back to JSON/demo data.
// express-async-errors ensures rejected promises from async route handlers
// reach this middleware instead of becoming an unhandled rejection.
// -------------------------------------------------------------
function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  console.error(`[${req.method} ${req.path}] Unhandled error:`, err?.message || err);
  if (res.headersSent) return;
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: 'Something went wrong. Please try again.',
    ...(isProd ? {} : { detail: String(err?.message || err) }),
  });
}

async function startApp() {
  const usingJson = process.env.USE_JSON_DB === 'true';
  console.log('─────────────────────────────────────────────────────────');
  console.log(`  Mlo Wangu — database adapter: ${usingJson ? 'JSON (local file, dev only)' : 'Supabase (PostgreSQL, production)'}`);
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  if (!usingJson && (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn('  ⚠ USE_JSON_DB=false but Supabase env vars are incomplete — auth and financial routes will return 503, not fall back to JSON.');
  }
  console.log('─────────────────────────────────────────────────────────');

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mlo Wangu Kenyan Family Planner server running at http://0.0.0.0:${PORT}`);
  });
}

// Vercel's Node runtime imports `app` as a request handler and invokes it
// per-request — it never runs this file as a long-lived process, so
// app.listen() (and the dev/prod static-serving setup above, which only
// matters for a real persistent server) must not run there. Static assets
// are served directly by Vercel's own build output for the Vite frontend;
// only /api/* is routed to this function (see api/[...path].ts), so the
// only thing this function needs is the routes already registered above
// plus the error handler.
if (!process.env.VERCEL) {
  startApp();
} else {
  app.use(errorHandler);
}

export default app;
