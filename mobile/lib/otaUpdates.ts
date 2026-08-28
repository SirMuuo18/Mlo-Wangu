// Over-the-air (OTA) update service (EAS Update / expo-updates), centralized
// here — nothing else in the app calls `expo-updates` directly.
//
// IMPORTANT — what OTA can and cannot ship:
//   OTA-safe:      JS/TS business logic, React UI, bundled JS assets.
//   Needs a NEW BUILD (not OTA): native modules, native permissions,
//                  app.json's native config, Expo SDK version bumps,
//                  React Native version bumps, or anything else that
//                  changes the native runtime.
//   `runtimeVersion` (app.json, policy: "fingerprint") is what enforces
//   this automatically — it's a hash of the native project, so any native
//   change makes the runtime version different and expo-updates will
//   simply refuse to apply an incompatible update rather than crash the
//   app. A native change always needs a new EAS build distributed through
//   the store (or an internal/dev build) — never hide this behind OTA.
//
// SAFETY DESIGN — why this never force-reloads automatically:
//   `app.json`'s `updates.checkAutomatically: "ON_LOAD"` already makes
//   expo-updates check-and-download in the background on every cold start,
//   with `fallbackToCacheTimeout: 0` so startup is NEVER blocked waiting on
//   network. A downloaded update activates itself the next time the OS
//   launches the app fresh — no explicit `reloadAsync()` needed for that
//   path, which means the automatic path can *structurally never* interrupt
//   an in-progress payment, financial flow, form submission, account
//   deletion, or meal generation, since it never forces anything mid-session.
//   The only place this module ever calls `reloadAsync()` is
//   `downloadAndApplyUpdate()`, reserved for an explicit, user-initiated
//   "Check for updates" tap (see mobile/app/(app)/(tabs)/more/account.tsx) —
//   by definition not mid-transaction, since the user navigated to Settings
//   and tapped a button.
import * as Updates from 'expo-updates';

export type OtaCheckResult =
  | { status: 'update-available' }
  | { status: 'up-to-date' }
  | { status: 'unsupported'; reason: string } // dev mode / Expo Go / disabled
  | { status: 'error'; message: string };

export type OtaApplyResult =
  | { status: 'applied' } // downloaded + about to reload
  | { status: 'up-to-date' }
  | { status: 'unsupported'; reason: string }
  | { status: 'error'; message: string };

// Conservative timeout so a slow/unreachable update server can never hang
// a caller indefinitely — checkForUpdateAsync() itself has no built-in
// timeout, so this module supplies one.
const CHECK_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OTA update check timed out')), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// Never logs update manifest contents or any token/credential — only a
// short, safe status string.
function safeLog(message: string): void {
  console.log(`[ota] ${message}`);
}

// `Updates.isEnabled` is false in Expo Go, in a plain `expo start` dev
// session, or if expo-updates couldn't initialize (missing/invalid
// runtimeVersion or URL) — every function below checks this first and
// fails safe (never throws) rather than letting `checkForUpdateAsync()`
// itself reject and surface a confusing error to a caller.
function unsupportedReason(): string | null {
  if (!Updates.isEnabled) return 'expo-updates is disabled (development mode or Expo Go)';
  return null;
}

// Read-only: checks for an available update without downloading it. Safe
// to call as often as reasonable (e.g. once per app foreground) — never
// throws, never blocks longer than CHECK_TIMEOUT_MS.
export async function checkForUpdates(): Promise<OtaCheckResult> {
  const reason = unsupportedReason();
  if (reason) return { status: 'unsupported', reason };

  try {
    const result = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
    return result.isAvailable ? { status: 'update-available' } : { status: 'up-to-date' };
  } catch (err) {
    safeLog(`check failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return { status: 'error', message: 'Could not check for updates right now.' };
  }
}

// Downloads (if available) and reloads into the new update. This is the
// ONLY function in the app that calls Updates.reloadAsync() — reserved for
// an explicit, user-initiated action (see the module header). Never
// throws; the caller's UI should treat every non-'applied' status as "stay
// on the current version," never as a crash.
export async function downloadAndApplyUpdate(): Promise<OtaApplyResult> {
  const reason = unsupportedReason();
  if (reason) return { status: 'unsupported', reason };

  try {
    const check = await withTimeout(Updates.checkForUpdateAsync(), CHECK_TIMEOUT_MS);
    if (!check.isAvailable) return { status: 'up-to-date' };

    const fetchResult = await Updates.fetchUpdateAsync();
    if (!fetchResult.isNew) return { status: 'up-to-date' };

    safeLog('update downloaded, reloading');
    // Per the module header: only reached from an explicit user action,
    // never automatically — see downloadAndApplyUpdate()'s call sites.
    await Updates.reloadAsync();
    return { status: 'applied' };
  } catch (err) {
    safeLog(`apply failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return { status: 'error', message: 'Could not download the update right now. Please try again later.' };
  }
}

// For a settings/about screen — safe, human-readable build info. Never
// exposes anything sensitive (no tokens, no internal update IDs beyond the
// public update UUID expo-updates already reports).
export function getOtaDebugInfo() {
  return {
    isEnabled: Updates.isEnabled,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
  };
}
