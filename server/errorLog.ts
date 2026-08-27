// Server-side error log — allowlist sanitization, fire-and-forget writes.
// See migrations/0013_server_error_log.sql. Deliberately called from only a
// handful of named, high-value failure points (payment callback, admin
// verify/reject) — not a blanket wrapper around every console.error in
// server.ts — which bounds write volume by construction.
//
// The `message`/`context` this function receives must already be a safe,
// hand-built string/object at the call site — never pass a raw Error, the
// request body, or request headers in directly. This is the one place a
// password, token, PIN, or raw M-Pesa message must never end up.
import { errorLogDb } from './secure-db.js';

export interface LogErrorEntry {
  route: string;
  severity?: 'error' | 'warning';
  userId?: string | null;
  message: string;
  context?: Record<string, unknown>;
}

// Never throws and never awaited by callers for correctness — a failure to
// log must never change the behavior of the request it's logging alongside.
export function logServerError(entry: LogErrorEntry): void {
  errorLogDb
    .logServerError({
      route: entry.route,
      severity: entry.severity ?? 'error',
      userId: entry.userId ?? null,
      message: entry.message,
      context: entry.context,
    })
    .catch(() => { /* best-effort — logging the log failure would be circular */ });
}
