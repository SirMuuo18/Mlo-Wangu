// Budget PIN entry — the PIN itself is verified entirely server-side
// (POST /api/financial-auth/unlock); this screen only collects 6 digits and
// reports whatever the server decides. Lockout (5 wrong attempts → 5 min,
// 10 → 30 min) is also enforced server-side; the countdown shown here is
// cosmetic, matching the web app's own PinModal.
import React, { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthGuard } from '../components/AuthGuard';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { ApiError } from '../lib/api';
import { useFinancialSession } from '../context/FinancialSessionContext';
import { colors, radius, spacing } from '../constants/theme';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

function UnlockContent() {
  const { unlock } = useFinancialSession();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(0);

  const submit = async (finalPin: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await unlock(finalPin);
      router.back();
    } catch (err) {
      setPin('');
      if (err instanceof ApiError && err.status === 429) {
        setLockedSeconds(60);
      }
      setError(err instanceof Error ? err.message : 'Incorrect PIN.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePress = (digit: string) => {
    if (isLoading || lockedSeconds > 0) return;
    if (digit === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (digit === '' || pin.length >= 6) return;
    const next = pin + digit;
    setPin(next);
    setError(null);
    if (next.length === 6) submit(next);
  };

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={28} color={colors.gold} />
        </View>
        <AppText variant="heading" style={styles.title}>Unlock Private Budget</AppText>
        <AppText variant="body" color={colors.moss} style={styles.subtitle}>
          Enter your 6-digit Budget PIN.
        </AppText>

        <View style={styles.dots}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled]} />
          ))}
        </View>

        {error ? <AppText variant="caption" color={colors.danger} style={styles.error}>{error}</AppText> : null}

        <View style={styles.numpad}>
          {DIGITS.map((digit, i) => (
            <Pressable
              key={i}
              style={[styles.key, !digit && styles.keyHidden]}
              onPress={() => handlePress(digit)}
              disabled={!digit || isLoading || lockedSeconds > 0}
            >
              <AppText variant="heading">{digit}</AppText>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

export default function BudgetUnlockScreen() {
  return (
    <AuthGuard>
      <UnlockContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', padding: spacing.xl },
  iconWrap: { width: 56, height: 56, borderRadius: radius.xl, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg, marginBottom: spacing.md },
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', marginTop: 4, marginBottom: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.cream },
  dotFilled: { backgroundColor: colors.gold, borderColor: colors.gold },
  error: { marginBottom: spacing.md },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'space-between' },
  key: { width: 76, height: 60, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.cream },
  keyHidden: { backgroundColor: 'transparent' },
});
