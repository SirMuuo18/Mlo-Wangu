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
import { checkForUpdates, downloadAndApplyUpdate, getOtaDebugInfo } from '../../../../lib/otaUpdates';
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

  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'applying' | 'up-to-date' | 'unsupported' | 'error'>('idle');
  const [updateMessage, setUpdateMessage] = useState('');
  const otaInfo = getOtaDebugInfo();

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

  // Explicit, user-initiated update check — the ONLY path in the app that
  // can trigger an OTA reload (see mobile/lib/otaUpdates.ts's module
  // header for why the automatic background check never force-reloads).
  // Since this only runs when the user taps this button from Settings,
  // it can never interrupt a payment/financial/deletion/generation flow.
  const handleCheckForUpdates = async () => {
    if (updateStatus === 'checking' || updateStatus === 'applying') return;
    setUpdateStatus('checking');
    setUpdateMessage('');
    const check = await checkForUpdates();
    if (check.status === 'unsupported') {
      setUpdateStatus('unsupported');
      setUpdateMessage('Updates are unavailable in this build (development mode).');
      return;
    }
    if (check.status === 'error') {
      setUpdateStatus('error');
      setUpdateMessage(check.message);
      return;
    }
    if (check.status === 'up-to-date') {
      setUpdateStatus('up-to-date');
      setUpdateMessage("You're up to date.");
      return;
    }
    // An update is available — download and apply it now that we know
    // this is an explicit, user-initiated action.
    setUpdateStatus('applying');
    setUpdateMessage('Update available — restarting to apply…');
    const apply = await downloadAndApplyUpdate();
    if (apply.status === 'error') {
      setUpdateStatus('error');
      setUpdateMessage(apply.message);
    } else if (apply.status === 'up-to-date') {
      setUpdateStatus('up-to-date');
      setUpdateMessage("You're up to date.");
    }
    // 'applied' reloads the app itself — no further state update needed.
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
        <AppText variant="subheading">App updates</AppText>
        <AppText variant="caption" color={colors.moss} style={{ marginTop: spacing.xs, marginBottom: spacing.sm }}>
          {otaInfo.isEnabled
            ? `Running update ${otaInfo.updateId ? otaInfo.updateId.slice(0, 8) : 'embedded'} on channel ${otaInfo.channel ?? 'unknown'}. Small fixes and improvements can be applied this way — bigger changes still need a new app-store update.`
            : 'Update checking is unavailable in this development build.'}
        </AppText>
        {updateMessage ? (
          <AppText variant="caption" color={updateStatus === 'error' ? colors.danger : colors.moss} style={{ marginBottom: spacing.sm }}>
            {updateMessage}
          </AppText>
        ) : null}
        <Button
          label={updateStatus === 'checking' ? 'Checking…' : updateStatus === 'applying' ? 'Applying…' : 'Check for updates'}
          onPress={handleCheckForUpdates}
          loading={updateStatus === 'checking' || updateStatus === 'applying'}
          disabled={!otaInfo.isEnabled}
          variant="secondary"
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
