// Local, on-device water reminders — the ONE reminder type with real
// persisted backend infrastructure to expose (WaterTargetConfig's
// `remindersEnabled` / `reminderFrequencyMinutes` / `schedule`, already
// saved via the existing PUT /api/water/config and read via GET
// /api/water/today — see hooks/useWater.ts). Investigated first: no other
// reminder type (shopping, meal prep, budget review, custom household)
// has ANY persistence or API in the current backend — schema.sql has no
// "reminders" table, and nothing server-side ever consumed these water
// fields until now either. Building local scheduling for those other types
// would mean inventing state with nowhere real to persist it, which is
// exactly what this phase is not supposed to do — see the Phase 3A report
// for the full gap analysis and what a real "reminders" feature would need.
//
// IMPORTANT: this schedules local notifications via expo-notifications.
// No physical device or emulator is available in this environment, so
// actual delivery (does a notification really fire at the scheduled time)
// is UNVERIFIED — only that the permission/scheduling API calls themselves
// complete without error. Do not read "implemented" as "confirmed working
// on a device."
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { WaterTargetConfig } from '../types/domain';
import type { ReminderConfig } from './api';

const NOTIFICATION_CATEGORY = 'mlo-water-reminder';
const CUSTOM_NOTIFICATION_CATEGORY = 'mlo-custom-reminder';

// Expo's CALENDAR trigger `weekday` is 1=Sunday..7=Saturday (matches
// JS Date.getDay() + 1, not an ISO weekday).
const WEEKDAY_NUMBER: Record<string, number> = { sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestReminderPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function cancelAllWaterReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.category === NOTIFICATION_CATEGORY)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

// Schedules one repeating daily local notification per time in
// config.schedule (e.g. "08:00", "10:30", ...) — exactly the times the user
// already saved server-side. Call this again whenever the config changes;
// it always clears its own previous schedule first so times are never
// duplicated or stale.
export async function syncWaterReminders(config: WaterTargetConfig): Promise<{ scheduled: number }> {
  await cancelAllWaterReminders();
  if (!config.remindersEnabled || config.schedule.length === 0) return { scheduled: 0 };

  const granted = await requestReminderPermission();
  if (!granted) return { scheduled: 0 };

  let scheduled = 0;
  for (const time of config.schedule) {
    const [hourStr, minuteStr] = time.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '💧 Hydration Check',
        body: `Time for a glass of water — your target is ${config.dailyTargetMl}ml today.`,
        data: { category: NOTIFICATION_CATEGORY },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        hour,
        minute,
        repeats: true,
      },
    });
    scheduled++;
  }
  return { scheduled };
}

export async function disableWaterReminders(): Promise<void> {
  await cancelAllWaterReminders();
}

async function cancelAllCustomReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.data?.category === CUSTOM_NOTIFICATION_CATEGORY)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

// Schedules local notifications for every enabled shopping_day/custom
// reminder config (Phase 3B, item 2) — always clears its own previous
// schedule first, exactly like syncWaterReminders, so re-calling this after
// any config change never leaves a stale or duplicated notification. A
// reminder with no daysOfWeek fires daily; one with specific days schedules
// one trigger per selected weekday (Expo's CALENDAR trigger only supports a
// single weekday per registration).
export async function syncCustomReminders(configs: ReminderConfig[]): Promise<{ scheduled: number }> {
  await cancelAllCustomReminders();
  const enabled = configs.filter((c) => c.enabled);
  if (enabled.length === 0) return { scheduled: 0 };

  const granted = await requestReminderPermission();
  if (!granted) return { scheduled: 0 };

  let scheduled = 0;
  for (const config of enabled) {
    const [hourStr, minuteStr] = config.time.split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;

    const title = config.type === 'shopping_day' ? '🛒 Shopping Day' : '🔔 Reminder';
    const body = config.label;
    const weekdays = config.daysOfWeek.length > 0
      ? config.daysOfWeek.map((d) => WEEKDAY_NUMBER[d]).filter((n): n is number => Number.isFinite(n))
      : [undefined]; // undefined weekday = fires every day

    for (const weekday of weekdays) {
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data: { category: CUSTOM_NOTIFICATION_CATEGORY, reminderId: config.id } },
        trigger: weekday
          ? { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, weekday, repeats: true }
          : { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, repeats: true },
      });
      scheduled++;
    }
  }
  return { scheduled };
}

export async function disableCustomReminders(): Promise<void> {
  await cancelAllCustomReminders();
}

export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';
