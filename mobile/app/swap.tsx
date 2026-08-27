// Swap a single meal slot — mirrors the web app's three "quick reason"
// buttons (Cheaper / Faster / Surprise Me) from SwapMealModal.tsx. The
// full "pick from a list of alternatives" browser is left for a later
// phase; the server-side swap logic (and its own randomness/sorting) is
// identical either way — this just calls the same endpoint.
import React, { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AuthGuard } from '../components/AuthGuard';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { useSwapMeal } from '../hooks/useMealPlan';
import { colors, radius, spacing } from '../constants/theme';

type Reason = 'cheaper' | 'faster' | 'random';

function SwapContent() {
  const { day, mealType, currentMealId, mealName } = useLocalSearchParams<{
    day: string; mealType: string; currentMealId: string; mealName?: string;
  }>();
  const swapMeal = useSwapMeal();
  const [error, setError] = useState<string | null>(null);

  const handleSwap = async (reason: Reason) => {
    setError(null);
    try {
      await swapMeal.mutateAsync({ day, mealType, currentMealId, reason });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not swap this meal. Please try again.');
    }
  };

  return (
    <Screen>
      <View style={styles.content}>
        <AppText variant="heading">Replace {mealName ? `"${mealName}"` : 'this meal'}</AppText>
        <AppText variant="body" color={colors.moss} style={styles.subtitle}>
          {day} · {mealType}
        </AppText>

        {error ? <ErrorState message={error} /> : null}

        <View style={styles.options}>
          <Button label="Cheaper Meal" variant="secondary" onPress={() => handleSwap('cheaper')} loading={swapMeal.isPending} />
          <Button label="Faster Prep" variant="secondary" onPress={() => handleSwap('faster')} loading={swapMeal.isPending} />
          <Button label="Surprise Me" variant="secondary" onPress={() => handleSwap('random')} loading={swapMeal.isPending} />
        </View>

        <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

export default function SwapScreen() {
  return (
    <AuthGuard>
      <SwapContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: spacing.lg },
  subtitle: { marginTop: 4, marginBottom: spacing.lg },
  options: { gap: spacing.sm, marginBottom: spacing.lg },
  optionButton: { justifyContent: 'flex-start', paddingLeft: spacing.lg },
});
