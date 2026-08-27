// Push-notification delivery — Expo push service.
// Plain fetch to Expo's HTTP push API, matching this codebase's existing
// style for every other external integration (mpesa.ts, email.ts are both
// bare-fetch/thin-client, never a heavy SDK) — no expo-server-sdk dependency.
//
// Push is deliberately never a standalone content channel: every call site
// sends a push only as a delivery amplifier for a notification that already
// exists in the `notifications` table (see server.ts's call sites). The
// payload never carries a KSh amount, access code, or other sensitive
// figure — only a generic title/body plus a {type, notificationId} data
// object for deep-linking, matching the Phase 3B item 1/3 privacy decision.
import { pushDb } from './secure-db.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  data?: { type: string; notificationId?: string };
}

// Never throws — a failed push is a non-fatal, best-effort operation (the
// user still has the in-app notification either way). Reactively cleans up
// any token Expo reports as DeviceNotRegistered, since no cron job exists
// in this codebase to do it on a schedule.
export async function sendPushToUser(userId: string, message: PushMessage): Promise<void> {
  let tokens: string[];
  try {
    tokens = await pushDb.getPushTokensForUser(userId);
  } catch {
    return; // best-effort — a lookup failure never propagates to the caller
  }
  if (tokens.length === 0) return;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        tokens.map((to) => ({ to, title: message.title, body: message.body, data: message.data ?? {} }))
      ),
    });
    const result = await res.json().catch(() => null);
    const tickets: Array<{ status: string; details?: { error?: string } }> = result?.data ?? [];
    await Promise.all(
      tickets.map(async (ticket, i) => {
        if (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          try { await pushDb.deletePushTokenByValue(tokens[i]); } catch { /* best-effort cleanup */ }
        }
      })
    );
  } catch {
    // Network/Expo-outage failure — non-fatal, matches sendEmail's discipline.
  }
}
