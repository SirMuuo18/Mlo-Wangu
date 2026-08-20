// Server-side authentication middleware.
// Validates Supabase JWT from HttpOnly cookie — never from client-provided headers.
// In JSON DB mode (USE_JSON_DB=true), uses a demo user for local development only.

import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const USE_JSON_DB = process.env.USE_JSON_DB === 'true';
const DEMO_USER_ID = 'usr_mwangi_demo';

function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k.trim() === name) return rest.join('=').trim();
  }
  return undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Dev mode: no Supabase needed
  if (USE_JSON_DB) {
    res.locals.userId = DEMO_USER_ID;
    return next();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    res.status(503).json({ error: 'Authentication service not configured' });
    return;
  }

  const accessToken = getCookie(req, 'mlo_auth_session');

  if (!accessToken) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data?.user) {
      // Try refresh if refresh token exists
      const refreshToken = getCookie(req, 'mlo_auth_refresh');
      if (refreshToken) {
        const refreshSupabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false },
        });
        const { data: refreshData, error: refreshError } = await refreshSupabase.auth.refreshSession({
          refresh_token: refreshToken,
        });

        if (refreshError || !refreshData?.session) {
          clearAuthCookies(res);
          res.status(401).json({ error: 'Session expired. Please sign in again.' });
          return;
        }

        // Set new cookies with refreshed tokens
        setAuthCookies(res, refreshData.session.access_token, refreshData.session.refresh_token ?? '');
        res.locals.userId = refreshData.session.user.id;
        res.locals.userEmail = refreshData.session.user.email;
        return next();
      }

      clearAuthCookies(res);
      res.status(401).json({ error: 'Invalid session. Please sign in again.' });
      return;
    }

    res.locals.userId = data.user.id;
    res.locals.userEmail = data.user.email;
    return next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Best-effort identity resolution for routes that are readable by anyone but
// personalize their result for a logged-in caller (e.g. public meal catalog
// browsing that also shows the caller's own private custom meals). Never
// rejects the request — res.locals.userId is simply left unset when no valid
// session is present.
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (USE_JSON_DB) {
    res.locals.userId = DEMO_USER_ID;
    return next();
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const accessToken = getCookie(req, 'mlo_auth_session');

  if (!supabaseUrl || !supabaseKey || !accessToken) return next();

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data?.user) {
      res.locals.userId = data.user.id;
      res.locals.userEmail = data.user.email;
    }
  } catch {
    // Swallow — this route works for anonymous callers too.
  }
  next();
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const secure = process.env.NODE_ENV === 'production';
  const cookieOptions = `; HttpOnly; SameSite=Strict; Path=/${secure ? '; Secure' : ''}`;

  // 1-hour access token
  const accessExpiry = new Date(Date.now() + 60 * 60 * 1000).toUTCString();
  res.setHeader('Set-Cookie', [
    `mlo_auth_session=${accessToken}; Expires=${accessExpiry}${cookieOptions}`,
    `mlo_auth_refresh=${refreshToken}; Max-Age=${60 * 60 * 24 * 7}${cookieOptions}`,
  ]);
}

export function clearAuthCookies(res: Response): void {
  res.setHeader('Set-Cookie', [
    'mlo_auth_session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict; Path=/',
    'mlo_auth_refresh=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict; Path=/',
  ]);
}
