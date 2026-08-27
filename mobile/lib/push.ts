// Expo push-token registration (Phase 3B, item 1).
//
// getExpoPushTokenAsync() requires an EAS projectId (Expo SDK 49+). The
// project is now linked (`eas init`, extra.eas.projectId in app.json) — but
// getEasProjectId() still returns null instead of throwing if that ever goes
// missing again (a fresh checkout without app.json's extra block, a future
// project unlink), matching the fail-closed pattern already used
// server-side for getDarajaConfig()/getEmailConfig(): every caller treats
// "not configured" as a normal, silent no-op, never a crash.
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { requestReminderPermission } from './reminders';
import { api } from './api';

export function getEasProjectId(): string | null {
  const id = Constants.expoConfig?.extra?.eas?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export const pushSupported = Platform.OS === 'ios' || Platform.OS === 'android';

// Call after login (and on app open while authenticated) — fetches a fresh
// Expo push token and registers it server-side. Silently no-ops (never
// throws) if EAS isn't configured or permission is denied, so callers never
// need their own try/catch for "push isn't set up yet."
export async function registerForPushNotifications(): Promise<void> {
  if (!pushSupported) return;
  const projectId = getEasProjectId();
  if (!projectId) {
    console.log('[push] Not registering — no EAS projectId configured yet.');
    return;
  }
  const granted = await requestReminderPermission();
  if (!granted) return;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token, Platform.OS as 'ios' | 'android');
  } catch (err) {
    console.log('[push] Registration failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}

// Call at logout, before the session is cleared, so the token stops being a
// live delivery target for an account no longer signed in on this device.
export async function unregisterPushNotifications(): Promise<void> {
  if (!pushSupported) return;
  const projectId = getEasProjectId();
  if (!projectId) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.unregisterPushToken(token);
  } catch (err) {
    console.log('[push] Unregister failed (non-fatal):', err instanceof Error ? err.message : err);
  }
}
