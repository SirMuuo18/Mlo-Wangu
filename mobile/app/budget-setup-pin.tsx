// Create/change the Budget PIN. Validation (exactly 6 digits, not a
// trivial sequence like 111111) is enforced server-side
// (POST /api/financial-auth/setup-pin) — the client-side checks here are
// only to give faster feedback, never the actual authority.
import React, { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthGuard } from '../components/AuthGuard';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useFinancialSession } from '../context/FinancialSessionContext';
import { colors, radius, spacing } from '../constants/theme';

function SetupPinContent() {
  const { setupPin } = useFinancialSession();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 numeric digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match.');
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await setupPin(pin, confirmPin);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the PIN. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.iconWrap}>
        <Ionicons name="key" size={28} color={colors.gold} />
      </View>
      <AppText variant="heading" style={styles.title}>Create Your Budget PIN</AppText>
      <AppText variant="body" color={colors.moss} style={styles.subtitle}>
        A private 6-digit PIN protects your salary and expenses, separate from your account password.
      </AppText>

      <TextField
        label="6-Digit PIN"
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
      />
      <TextField
        label="Confirm PIN"
        value={confirmPin}
        onChangeText={(v) => setConfirmPin(v.replace(/\D/g, '').slice(0, 6))}
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
      />

      {error ? <AppText variant="caption" color={colors.danger} style={styles.error}>{error}</AppText> : null}

      <Button label="Save & Protect Budget" onPress={handleSubmit} loading={isLoading} />
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} style={styles.cancel} />
    </Screen>
  );
}

export default function BudgetSetupPinScreen() {
  return (
    <AuthGuard>
      <SetupPinContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 56, height: 56, borderRadius: radius.xl, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.lg },
  error: { marginBottom: spacing.md },
  cancel: { marginTop: spacing.sm },
});
