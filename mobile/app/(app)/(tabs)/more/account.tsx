// Self-service profile management (Phase 3B, item 7) — mirrors the web
// AccountView.tsx's two forms against the exact same server contract
// (PUT /api/profile, POST /api/profile/change-email). No client-side
// business logic: name validation and the email-change secure flow
// (re-authentication, dual-inbox confirmation) are entirely server-side.
//
// Also hosts the mobile side of items 8/9 (data export, account deletion)
// — same GET /api/account/export / POST /api/account/delete contract the
// web AccountView.tsx already uses, no second data model, no new endpoints.
import React, { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Screen } from '../../../../components/Screen';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { TextField } from '../../../../components/TextField';
import { Button } from '../../../../components/Button';
import { useAuth } from '../../../../context/AuthContext';
import { useFinancialSession } from '../../../../context/FinancialSessionContext';
import { api, ApiError } from '../../../../lib/api';
import { colors, spacing } from '../../../../constants/theme';

export default function AccountScreen() {
  const { user, refreshUser, logout } = useAuth();
  const { isUnlocked, token: financialToken } = useFinancialSession();

  const [name, setName] = useState(user?.name ?? '');
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [nameError, setNameError] = useState('');

  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailStatus, setEmailStatus] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');
  const [emailError, setEmailError] = useState('');

  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'error'>('idle');
  const [exportError, setExportError] = useState('');

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const [deleteError, setDeleteError] = useState('');

  const saveName = async () => {
    setNameStatus('saving');
    setNameError('');
    try {
      await api.updateProfileName(name.trim());
      await refreshUser();
      setNameStatus('saved');
    } catch (err) {
      setNameStatus('error');
      setNameError(err instanceof ApiError ? err.message : 'Could not update your name.');
    }
  };

  const changeEmail = async () => {
    setEmailStatus('saving');
    setEmailError('');
    try {
      await api.changeEmail(newEmail.trim(), currentPassword);
      setEmailStatus('sent');
      setNewEmail('');
      setCurrentPassword('');
    } catch (err) {
      setEmailStatus('error');
      setEmailError(err instanceof ApiError ? err.message : 'Could not change your email.');
    }
  };

  // Financial section is only included server-side when a currently-valid,
  // unlocked financial session token is presented — same gate every other
  // financial read already uses, not a new mechanism. Unlocked-but-stale
  // tokens are rejected server-side regardless of what's passed here.
  const handleExport = async () => {
    if (exportStatus === 'exporting') return; // guards against a double-tap submitting twice
    setExportStatus('exporting');
    setExportError('');
    try {
      const data = await api.exportAccountData(isUnlocked ? (financialToken ?? undefined) : undefined);
      const file = new File(Paths.cache, `mlo-wangu-my-data-${Date.now()}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(data, null, 2));
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save your Mlo Wangu data' });
      } else {
        // No share sheet available (rare, e.g. some emulators) — the file
        // still exists locally; tell the user plainly rather than silently
        // doing nothing.
        setExportStatus('error');
        setExportError('Sharing is not available on this device. Your data could not be saved.');
        return;
      }
      setExportStatus('idle');
    } catch (err) {
      setExportStatus('error');
      setExportError(err instanceof ApiError ? err.message : 'Could not export your data. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteStatus === 'deleting') return; // guards against a double-tap submitting twice
    setDeleteStatus('deleting');
    setDeleteError('');
    try {
      await api.deleteAccount(deletePassword);
      await logout();
      router.replace('/(auth)/login');
    } catch (err) {
      setDeleteStatus('error');
      setDeleteError(err instanceof ApiError ? err.message : 'Could not delete your account. Please try again.');
    }
  };

  return (
    <Screen scroll>
      <AppText variant="title">Account</AppText>

      <Card style={{ marginTop: spacing.lg }}>
        <AppText variant="subheading">Display name</AppText>
        <TextField
          label="Name"
          value={name}
          onChangeText={(t) => { setName(t); setNameStatus('idle'); }}
          maxLength={100}
          style={{ marginTop: spacing.sm }}
        />
        {nameStatus === 'error' ? <AppText variant="caption" color={colors.danger}>{nameError}</AppText> : null}
        <Button
          label={nameStatus === 'saving' ? 'Saving…' : nameStatus === 'saved' ? 'Saved' : 'Save name'}
          onPress={saveName}
          loading={nameStatus === 'saving'}
          disabled={!name.trim()}
          style={{ marginTop: spacing.sm }}
        />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <AppText variant="subheading">Change email</AppText>
        <AppText variant="caption" color={colors.moss} style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
          Current: {user?.email}. You'll confirm from links sent to both your current and new email — nothing changes until confirmed.
        </AppText>
        <TextField
          label="New email address"
          value={newEmail}
          onChangeText={(t) => { setNewEmail(t); setEmailStatus('idle'); }}
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Current password"
          value={currentPassword}
          onChangeText={(t) => { setCurrentPassword(t); setEmailStatus('idle'); }}
          secureTextEntry
        />
        {emailStatus === 'error' ? <AppText variant="caption" color={colors.danger}>{emailError}</AppText> : null}
        {emailStatus === 'sent' ? (
          <AppText variant="caption" color={colors.forest} style={{ marginBottom: spacing.sm }}>
            Check both inboxes to confirm the change.
          </AppText>
        ) : null}
        <Button
          label={emailStatus === 'saving' ? 'Sending…' : 'Change email'}
          onPress={changeEmail}
          loading={emailStatus === 'saving'}
          disabled={!newEmail.trim() || !currentPassword}
        />
      </Card>

      <Card style={{ marginTop: spacing.lg }}>
        <AppText variant="subheading">Download your data</AppText>
        <AppText variant="caption" color={colors.moss} style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
          Get a copy of everything Mlo Wangu holds about you. Unlock your Budget first if you also want your salary and expenses included.
        </AppText>
        {exportStatus === 'error' ? <AppText variant="caption" color={colors.danger}>{exportError}</AppText> : null}
        <Button
          label={exportStatus === 'exporting' ? 'Preparing…' : 'Download my data'}
          onPress={handleExport}
          loading={exportStatus === 'exporting'}
          variant="secondary"
        />
      </Card>

      <Card style={{ marginTop: spacing.lg, borderColor: colors.danger }}>
        <AppText variant="subheading" color={colors.danger}>Delete my account</AppText>
        <AppText variant="caption" color={colors.moss} style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
          This permanently deletes your account and all associated data. This cannot be undone.
        </AppText>
        <TextField
          label="Current password"
          value={deletePassword}
          onChangeText={(t) => { setDeletePassword(t); setDeleteStatus('idle'); }}
          secureTextEntry
        />
        <TextField
          label="Type DELETE to confirm"
          value={deleteConfirmText}
          onChangeText={(t) => { setDeleteConfirmText(t); setDeleteStatus('idle'); }}
          autoCapitalize="characters"
        />
        {deleteStatus === 'error' ? <AppText variant="caption" color={colors.danger}>{deleteError}</AppText> : null}
        <Button
          label={deleteStatus === 'deleting' ? 'Deleting…' : 'Permanently delete my account'}
          onPress={handleDeleteAccount}
          loading={deleteStatus === 'deleting'}
          disabled={!deletePassword || deleteConfirmText !== 'DELETE'}
          variant="secondary"
          style={{ backgroundColor: colors.danger }}
        />
      </Card>

      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}
