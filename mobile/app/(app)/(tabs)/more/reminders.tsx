// Custom & shopping-day reminders (Phase 3B, item 2) — config lives on the
// server (GET/POST/PUT/DELETE /api/reminders, shared with web); actual local
// notification delivery is mobile-only, via mobile/lib/reminders.ts's
// syncCustomReminders. No physical device is available to confirm delivery
// in this environment — only that scheduling completes without error.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../../components/Screen';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { TextField } from '../../../../components/TextField';
import { Button } from '../../../../components/Button';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { api, ApiError, ReminderConfig } from '../../../../lib/api';
import { syncCustomReminders } from '../../../../lib/reminders';
import { colors, radius, spacing } from '../../../../constants/theme';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'M' }, { key: 'tue', label: 'T' }, { key: 'wed', label: 'W' },
  { key: 'thu', label: 'T' }, { key: 'fri', label: 'F' }, { key: 'sat', label: 'S' }, { key: 'sun', label: 'S' },
];

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<ReminderConfig[] | null>(null);
  const [error, setError] = useState(false);
  const [type, setType] = useState<'shopping_day' | 'custom'>('custom');
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('18:00');
  const [days, setDays] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setError(false);
    try {
      const { reminders: r } = await api.getReminders();
      setReminders(r);
      await syncCustomReminders(r);
    } catch {
      setError(true);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleDay = (d: string) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  const handleAdd = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await api.createReminder({ type, label: label.trim(), time, daysOfWeek: days });
      setLabel('');
      setDays([]);
      await load();
    } catch (err) {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (r: ReminderConfig) => {
    await api.updateReminder(r.id, { enabled: !r.enabled }).catch(() => {});
    await load();
  };

  const handleDelete = async (id: string) => {
    await api.deleteReminder(id).catch(() => {});
    await load();
  };

  if (reminders === null && !error) return <LoadingState label="Loading reminders…" />;
  if (error && reminders === null) return <ErrorState message="Could not load reminders." onRetry={load} />;

  return (
    <Screen scroll>
      <AppText variant="title">Reminders</AppText>
      <AppText variant="caption" color={colors.moss} style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        Local reminders on this device only — for water reminders, use the toggle on Home.
      </AppText>

      <Card>
        <AppText variant="subheading">New reminder</AppText>
        <View style={styles.typeRow}>
          {(['custom', 'shopping_day'] as const).map((t) => (
            <Pressable key={t} onPress={() => setType(t)} style={[styles.typeChip, type === t && styles.typeChipActive]}>
              <AppText variant="caption" color={type === t ? colors.white : colors.ink}>
                {t === 'custom' ? 'Custom' : 'Shopping Day'}
              </AppText>
            </Pressable>
          ))}
        </View>
        <TextField label="What should it say?" value={label} onChangeText={setLabel} placeholder="e.g. Buy groceries" style={{ marginTop: spacing.sm }} />
        <TextField label="Time (24h HH:MM)" value={time} onChangeText={setTime} placeholder="18:00" />
        <AppText variant="label" color={colors.moss}>Days (none = every day)</AppText>
        <View style={styles.dayRow}>
          {DAYS.map((d) => (
            <Pressable key={d.key} onPress={() => toggleDay(d.key)} style={[styles.dayChip, days.includes(d.key) && styles.dayChipActive]}>
              <AppText variant="caption" color={days.includes(d.key) ? colors.white : colors.ink}>{d.label}</AppText>
            </Pressable>
          ))}
        </View>
        <Button label="Add reminder" onPress={handleAdd} loading={saving} disabled={!label.trim()} style={{ marginTop: spacing.sm }} />
      </Card>

      <View style={{ height: spacing.lg }} />

      {(reminders ?? []).length === 0 ? (
        <AppText variant="caption" color={colors.moss}>No reminders yet.</AppText>
      ) : (
        (reminders ?? []).map((r) => (
          <Card key={r.id} style={styles.reminderCard}>
            <View style={styles.reminderRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="bodyBold">{r.label}</AppText>
                <AppText variant="caption" color={colors.moss}>
                  {r.time} · {r.daysOfWeek.length > 0 ? r.daysOfWeek.join(', ') : 'Every day'} · {r.type === 'shopping_day' ? 'Shopping Day' : 'Custom'}
                </AppText>
              </View>
              <Pressable onPress={() => handleToggleEnabled(r)} hitSlop={8} style={{ marginRight: spacing.md }}>
                <Ionicons name={r.enabled ? 'toggle' : 'toggle-outline'} size={28} color={r.enabled ? colors.forest : colors.moss} />
              </Pressable>
              <Pressable onPress={() => handleDelete(r.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          </Card>
        ))
      )}
      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  typeChip: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  typeChipActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  dayRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.sm },
  dayChip: { width: 32, height: 32, borderRadius: radius.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  reminderCard: { marginBottom: spacing.sm },
  reminderRow: { flexDirection: 'row', alignItems: 'center' },
});
