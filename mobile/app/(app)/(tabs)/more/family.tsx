// Family Household — real, persisted data. Preserves the exact model the
// backend actually supports (confirmed in the Expo Readiness Audit):
// single-owner, whole-household-object PUT — no invitations, sharing, or
// multi-owner households exist server-side, so none are built here either.
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../../../components/Screen';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { Button } from '../../../../components/Button';
import { TextField } from '../../../../components/TextField';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { useHousehold, useUpdateHousehold } from '../../../../hooks/useHousehold';
import { colors, radius, spacing } from '../../../../constants/theme';
import type { AgeGroup, HouseholdMember } from '../../../../types/domain';

const AGE_GROUPS: AgeGroup[] = ['adult', 'teen', 'child', 'infant'];

interface MemberFormState {
  id?: string;
  name: string;
  ageGroup: AgeGroup;
  preferences: string;
  allergies: string;
  dislikes: string;
}

const EMPTY_FORM: MemberFormState = { name: '', ageGroup: 'adult', preferences: '', allergies: '', dislikes: '' };

function parseList(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export default function FamilyScreen() {
  const { data: household, isLoading, isError, refetch } = useHousehold();
  const updateHousehold = useUpdateHousehold();
  const [form, setForm] = useState<MemberFormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Loading your household…" />;
  if (isError || !household) return <ErrorState message="Could not load your household." onRetry={refetch} />;

  const openAdd = () => { setError(null); setForm(EMPTY_FORM); };
  const openEdit = (m: HouseholdMember) => {
    setError(null);
    setForm({
      id: m.id, name: m.name, ageGroup: m.ageGroup,
      preferences: m.preferences.join(', '), allergies: m.allergies.join(', '), dislikes: m.dislikes.join(', '),
    });
  };

  const handleSave = async () => {
    if (!form || !form.name.trim()) {
      setError('Enter a name.');
      return;
    }
    const members = [...household.members];
    const memberData: HouseholdMember = {
      id: form.id || `mem_${Date.now()}`,
      name: form.name.trim(),
      ageGroup: form.ageGroup,
      preferences: parseList(form.preferences),
      allergies: parseList(form.allergies),
      dislikes: parseList(form.dislikes),
    };
    const idx = members.findIndex((m) => m.id === form.id);
    if (idx >= 0) members[idx] = memberData; else members.push(memberData);

    try {
      await updateHousehold.mutateAsync({ ...household, members });
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (household.members.length <= 1) {
      setError('Your household must have at least 1 member.');
      return;
    }
    await updateHousehold.mutateAsync({ ...household, members: household.members.filter((m) => m.id !== id) });
  };

  return (
    <Screen scroll>
      <View style={styles.headerRow}>
        <AppText variant="title">{household.name || 'My Family'}</AppText>
        <Button label="+ Add" onPress={openAdd} style={styles.addButton} />
      </View>
      <AppText variant="caption" color={colors.moss} style={styles.subtitle}>
        {household.members.length} members · meal plans are scaled for everyone here.
      </AppText>

      <View style={styles.members}>
        {household.members.map((m) => (
          <Card key={m.id} style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <View style={styles.ageBadge}>
                <AppText variant="label" color={colors.forest}>{m.ageGroup}</AppText>
              </View>
              <View style={styles.memberActions}>
                <Button label="Edit" variant="ghost" onPress={() => openEdit(m)} style={styles.iconButton} />
                <Button label="Remove" variant="ghost" onPress={() => handleDelete(m.id)} style={styles.iconButton} />
              </View>
            </View>
            <AppText variant="subheading" style={styles.memberName}>{m.name}</AppText>
            {m.preferences.length > 0 ? (
              <AppText variant="caption" color={colors.moss}>Likes: {m.preferences.join(', ')}</AppText>
            ) : null}
            {m.allergies.length > 0 ? (
              <AppText variant="caption" color={colors.danger}>Allergies: {m.allergies.join(', ')}</AppText>
            ) : null}
            {m.dislikes.length > 0 ? (
              <AppText variant="caption" color={colors.moss}>Avoids: {m.dislikes.join(', ')}</AppText>
            ) : null}
          </Card>
        ))}
      </View>

      <Modal visible={!!form} animationType="slide" transparent onRequestClose={() => setForm(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <AppText variant="heading" style={styles.modalTitle}>
                {form?.id ? 'Edit Member' : 'Add Family Member'}
              </AppText>
              <TextField label="Name" value={form?.name ?? ''} onChangeText={(v) => setForm((f) => f && { ...f, name: v })} />
              <View style={styles.ageRow}>
                {AGE_GROUPS.map((ag) => (
                  <Button
                    key={ag}
                    label={ag}
                    variant={form?.ageGroup === ag ? 'primary' : 'secondary'}
                    onPress={() => setForm((f) => f && { ...f, ageGroup: ag })}
                    style={styles.ageButton}
                  />
                ))}
              </View>
              <TextField label="Food Preferences (comma separated)" value={form?.preferences ?? ''} onChangeText={(v) => setForm((f) => f && { ...f, preferences: v })} placeholder="e.g. Chapati, Ugali" />
              <TextField label="Allergies (comma separated)" value={form?.allergies ?? ''} onChangeText={(v) => setForm((f) => f && { ...f, allergies: v })} placeholder="e.g. Peanuts" />
              <TextField label="Dislikes (comma separated)" value={form?.dislikes ?? ''} onChangeText={(v) => setForm((f) => f && { ...f, dislikes: v })} placeholder="e.g. Chili" />
              {error ? <AppText variant="caption" color={colors.danger} style={styles.error}>{error}</AppText> : null}
              <Button label="Save" onPress={handleSave} loading={updateHousehold.isPending} />
              <Button label="Cancel" variant="ghost" onPress={() => setForm(null)} style={styles.cancelButton} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addButton: { minHeight: 38, paddingHorizontal: spacing.md },
  subtitle: { marginTop: 4, marginBottom: spacing.lg },
  members: { gap: spacing.md },
  memberCard: {},
  memberHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ageBadge: { backgroundColor: colors.cream, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2, borderWidth: 1, borderColor: colors.line },
  memberActions: { flexDirection: 'row', gap: 4 },
  iconButton: { minHeight: 0, paddingHorizontal: spacing.sm },
  memberName: { marginTop: spacing.sm, marginBottom: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  modalTitle: { marginBottom: spacing.md },
  ageRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md },
  ageButton: { flex: 1, minHeight: 34, paddingHorizontal: 2 },
  error: { marginBottom: spacing.md },
  cancelButton: { marginTop: spacing.sm },
});
