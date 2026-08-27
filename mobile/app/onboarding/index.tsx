// Routing/foundation only, per Phase 1's scope — not the full 5-step wizard
// the web app has (src/components/onboarding/OnboardingFlow.tsx: welcome,
// household type, preferences/allergies, member count, budget). That's
// real screen-building work for a later phase. What this screen DOES do for
// real: call the actual POST /api/onboarding/complete endpoint (the same
// one the web wizard's last step calls) and then refresh the user from the
// server — proving the server-authoritative onboardingComplete flag and its
// routing guard work end to end, without inventing a second, client-only
// "onboarding done" flag.
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Logo } from '../../components/Logo';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../constants/theme';

export default function OnboardingScreen() {
  const { user, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleComplete = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await api.completeOnboarding({});
      // Re-fetch /api/auth/me so `user.onboardingComplete` reflects the
      // server's new value — the onboarding/_layout.tsx guard above then
      // redirects to the app shell on its own once `user` updates.
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <Logo size={104} />
        <AppText variant="title" style={styles.title}>
          Karibu, {user?.name || 'Friend'}!
        </AppText>
        <AppText variant="body" color={colors.moss} style={styles.body}>
          Your household setup — meal preferences, allergies, and budget — will live here.
          For now, finish onboarding to continue into the app.
        </AppText>
        {error ? (
          <AppText variant="caption" color={colors.danger} style={styles.error}>
            {error}
          </AppText>
        ) : null}
        <Button label="Get Started" onPress={handleComplete} loading={isSubmitting} style={styles.button} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { marginTop: spacing.lg, textAlign: 'center' },
  body: { marginTop: spacing.md, textAlign: 'center' },
  error: { marginTop: spacing.md },
  button: { marginTop: spacing.xl, alignSelf: 'stretch' },
});
