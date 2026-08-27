// Recipe detail — a real navigation route (not a shared-state modal), so it
// can be pushed from Home, the weekly Meals view, the catalog, and What Can
// I Cook? results alike with nothing more than a meal id in the URL. Fetches
// the same GET /api/meals/:id the web app's RecipeModal effectively reads
// from (via AppContext's already-loaded catalog) — here it's a live fetch
// since there's no app-wide catalog cache to piggyback on.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthGuard } from '../../components/AuthGuard';
import { AppText } from '../../components/AppText';
import { Card } from '../../components/Card';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { useMeal } from '../../hooks/useMeals';
import { colors, spacing } from '../../constants/theme';

function RecipeContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: meal, isLoading, isError, refetch } = useMeal(id);

  if (isLoading) return <LoadingState label="Loading recipe…" />;
  if (isError || !meal) return <ErrorState message="Could not load this recipe." onRetry={refetch} />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AppText variant="title">{meal.name}</AppText>
      {meal.swahiliName ? (
        <AppText variant="body" color={colors.forest} style={styles.swahili}>{meal.swahiliName}</AppText>
      ) : null}

      <View style={styles.metaRow}>
        <MetaPill icon="time" label={`${meal.prepTimeMinutes} min`} />
        <MetaPill icon="cash" label={`KSh ${meal.estimatedCostKsh}`} />
        <MetaPill icon="flame" label={`${meal.nutrition.approxCalories} kcal`} />
      </View>

      <Card style={styles.card}>
        <AppText variant="subheading" style={styles.sectionTitle}>Ingredients</AppText>
        {meal.ingredients.map((ing, i) => (
          <View key={i} style={styles.ingredientRow}>
            <AppText variant="body">{ing.name}</AppText>
            <AppText variant="bodyBold" color={colors.forest}>{ing.quantity} {ing.unit}</AppText>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <AppText variant="subheading" style={styles.sectionTitle}>Instructions</AppText>
        {meal.instructions.map((step, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={styles.stepNumber}>
              <AppText variant="caption" color={colors.white}>{i + 1}</AppText>
            </View>
            <AppText variant="body" style={styles.stepText}>{step}</AppText>
          </View>
        ))}
      </Card>

      {meal.kenyanCookingTips ? (
        <Card style={[styles.card, styles.tipCard]}>
          <View style={styles.tipRow}>
            <Ionicons name="bulb" size={18} color={colors.gold} />
            <AppText variant="body" style={styles.tipText}>{meal.kenyanCookingTips}</AppText>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const MetaPill: React.FC<{ icon: React.ComponentProps<typeof Ionicons>['name']; label: string }> = ({ icon, label }) => (
  <View style={styles.pill}>
    <Ionicons name={icon} size={13} color={colors.moss} />
    <AppText variant="caption" color={colors.moss}>{label}</AppText>
  </View>
);

export default function RecipeScreen() {
  return (
    <AuthGuard>
      <RecipeContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, backgroundColor: colors.cream },
  swahili: { fontStyle: 'italic', marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  card: { marginBottom: spacing.md },
  sectionTitle: { marginBottom: spacing.sm },
  ingredientRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  stepRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  stepNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1 },
  tipCard: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  tipRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  tipText: { flex: 1 },
});
