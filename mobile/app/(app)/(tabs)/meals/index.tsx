// Weekly Meal Plan — real data, day-selector + 4 slots per day, matching
// the web app's Weekly Schedule sub-view. The Recipe Catalog and Kenyan
// Ingredient Prices sub-tabs from the web app are not carried over this
// phase (see the Phase 2 report) — this screen focuses on the plan itself
// and the entitlement-gated "Generate New Plan" action.
import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '../../../../components/AppText';
import { Button } from '../../../../components/Button';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { EmptyState } from '../../../../components/EmptyState';
import { useAuth } from '../../../../context/AuthContext';
import { useMealPlan, useEntitlementStatus, useGenerateMealPlan, useToggleWeekStar, useStarredMeals, useToggleMealStar, ApiError } from '../../../../hooks/useMealPlan';
import { colors, radius, spacing } from '../../../../constants/theme';
import type { DayOfWeek, Meal, MealCategory } from '../../../../types/domain';

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOTS: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function MealsScreen() {
  const { user } = useAuth();
  const mealPlanQuery = useMealPlan();
  const entitlementQuery = useEntitlementStatus();
  const generateMealPlan = useGenerateMealPlan();
  const toggleWeekStar = useToggleWeekStar();
  const starredMealsQuery = useStarredMeals();
  const toggleMealStar = useToggleMealStar();
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');
  const [generateError, setGenerateError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerateError(null);
    // Premium bypasses the gate server-side regardless of what this client
    // thinks — this check is only to decide which UI to show, exactly like
    // web's attemptGeneratePlan().
    if (user?.isPremium || entitlementQuery.data?.hasEntitlement) {
      try {
        await generateMealPlan.mutateAsync();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PAYMENT_REQUIRED') {
          router.push('/generate-plan');
        } else {
          setGenerateError(err instanceof Error ? err.message : 'Failed to generate your plan.');
        }
      }
    } else {
      router.push('/generate-plan');
    }
  };

  if (mealPlanQuery.isLoading) return <LoadingState label="Loading your meal plan…" />;
  if (mealPlanQuery.isError) return <ErrorState message="Could not load your meal plan." onRetry={mealPlanQuery.refetch} />;

  const dayPlan = mealPlanQuery.data?.days[selectedDay];
  const starredMealIds = starredMealsQuery.data ?? new Set<string>();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <AppText variant="title">Weekly Meals</AppText>
        <Button
          label={generateMealPlan.isPending ? 'Working…' : 'Generate New'}
          onPress={handleGenerate}
          loading={generateMealPlan.isPending}
          style={styles.generateButton}
        />
      </View>
      {mealPlanQuery.data ? (
        <Button
          label={mealPlanQuery.data.isStarred ? '★ Week Starred (tap to unstar)' : '☆ Star this week'}
          variant="secondary"
          onPress={() => toggleWeekStar.mutate({ weekStartDate: mealPlanQuery.data!.weekStartDate, starred: !!mealPlanQuery.data!.isStarred })}
          loading={toggleWeekStar.isPending}
          style={styles.starWeekButton}
        />
      ) : null}
      {generateError ? (
        <AppText variant="caption" color={colors.danger} style={styles.generateError}>{generateError}</AppText>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayPills} contentContainerStyle={styles.dayPillsContent}>
        {DAYS.map((day) => (
          <Button
            key={day}
            label={day.slice(0, 3)}
            variant={selectedDay === day ? 'primary' : 'secondary'}
            onPress={() => setSelectedDay(day)}
            style={styles.dayPill}
          />
        ))}
      </ScrollView>

      {!mealPlanQuery.data ? (
        <EmptyState
          title="Your week is waiting"
          message="Generate a Kenyan meal plan tailored to your household to get started."
        />
      ) : (
        <View style={styles.slotList}>
          {SLOTS.map((slot) => (
            <MealSlotCard
              key={slot}
              label={slot}
              meal={dayPlan?.[slot]}
              day={selectedDay}
              slot={slot}
              isStarred={!!dayPlan?.[slot] && starredMealIds.has(dayPlan[slot]!.id)}
              onToggleStar={() => dayPlan?.[slot] && toggleMealStar.mutate({ mealId: dayPlan[slot]!.id, starred: starredMealIds.has(dayPlan[slot]!.id) })}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const MealSlotCard: React.FC<{ label: string; meal?: Meal; day: DayOfWeek; slot: string; isStarred?: boolean; onToggleStar?: () => void }> = ({ label, meal, day, slot, isStarred, onToggleStar }) => (
  <View style={styles.slotCard}>
    <View style={styles.slotHeaderRow}>
      <AppText variant="label" color={colors.forest}>{label}</AppText>
      {meal && onToggleStar ? (
        <Button label={isStarred ? '★' : '☆'} variant="secondary" onPress={onToggleStar} style={styles.starMealButton} />
      ) : null}
    </View>
    {meal ? (
      <>
        <AppText variant="bodyBold" style={styles.slotMealName}>{meal.name}</AppText>
        <AppText variant="caption" color={colors.moss}>{meal.prepTimeMinutes} min · KSh {meal.estimatedCostKsh}</AppText>
        <View style={styles.slotActions}>
          <Button label="View Recipe" variant="secondary" onPress={() => router.push(`/recipe/${meal.id}`)} style={styles.slotActionButton} />
          <Button
            label="Swap"
            variant="secondary"
            onPress={() => router.push({ pathname: '/swap', params: { day, mealType: slot, currentMealId: meal.id, mealName: meal.name } })}
            style={styles.slotActionButton}
          />
        </View>
      </>
    ) : (
      <AppText variant="caption" color={colors.moss} style={styles.noMeal}>No meal scheduled</AppText>
    )}
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  generateButton: { minHeight: 40, paddingHorizontal: spacing.md },
  starWeekButton: { marginTop: spacing.sm, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: spacing.md },
  generateError: { marginTop: spacing.sm },
  dayPills: { marginTop: spacing.md, marginBottom: spacing.lg, flexGrow: 0 },
  dayPillsContent: { gap: spacing.xs },
  dayPill: { minHeight: 36, paddingHorizontal: spacing.md },
  slotList: { gap: spacing.md },
  slotCard: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: spacing.lg },
  slotHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  starMealButton: { minHeight: 32, minWidth: 44, paddingHorizontal: spacing.sm },
  slotMealName: { marginTop: spacing.xs },
  noMeal: { marginTop: spacing.xs },
  slotActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  slotActionButton: { flex: 1, minHeight: 38 },
});
