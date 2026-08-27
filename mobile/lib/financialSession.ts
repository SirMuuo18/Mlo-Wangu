// Storage/lifecycle strategy for the Budget-PIN financial session token
// (Section 07/20 of the Expo Readiness Audit) — plumbing only. The full
// unlock-PIN UI is a later phase; this exists now so `lib/api.ts` has one
// real place to attach `X-Financial-Session`, and so logout has a real
// value to clear (see context/AuthContext.tsx's logout()).
//
// Storage decision: expo-secure-store, same as the main auth session (never
// AsyncStorage — this is a bearer credential, however short-lived). It is
// safe to persist across an app relaunch because the SERVER, not this
// client, is the actual enforcer of the token's 15-minute expiry and
// single-active-session-per-user rule — a stale/expired token presented
// after a relaunch simply gets a clean 401 BUDGET_LOCKED / 403
// SESSION_EXPIRED from the existing requireFinancialSession middleware,
// which the UI already has to handle regardless of where the token came
// from. This mirrors the web app's own behavior: its HttpOnly cookie
// likewise survives a page reload within the same 15-minute window.
import * as SecureStore from 'expo-secure-store';

const FINANCIAL_TOKEN_KEY = 'mlo_financial_session_token';

export async function getFinancialToken(): Promise<string | null> {
  return SecureStore.getItemAsync(FINANCIAL_TOKEN_KEY);
}

export async function setFinancialToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(FINANCIAL_TOKEN_KEY, token);
}

// Called on Lock Budget, on a 401/403 from a /api/financial/* call, and
// always on logout (see AuthContext) — never left behind for the next user
// of a shared/reset device.
export async function clearFinancialToken(): Promise<void> {
  await SecureStore.deleteItemAsync(FINANCIAL_TOKEN_KEY);
}
