// Real Home dashboard — mirrors src/components/HomeView.tsx's actual
// content (today's meals, hydration widget, family card, budget-privacy
// card) rebuilt as native, phone-first layout rather than a shrunk 3-column
// desktop grid. Every number here comes from a live API call; nothing is
// computed client-side beyond picking "today" out of the already-generated
// weekly plan.
import React, { useState } from 'react';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../components/AppText';
import { Card } from '../../../components/Card';
import { Button } from '../../../components/Button';
import { useAuth } from '../../../context/AuthContext';
import { useFinancialSession } from '../../../context/FinancialSessionContext';
import { useMealPlan } from '../../../hooks/useMealPlan';
import { useWaterData, useLogWater } from '../../../hooks/useWater';
import { useHousehold } from '../../../hooks/useHousehold';
import { useFinancialSummary } from '../../../hooks/useFinancial';
import { syncWaterReminders, disableWaterReminders } from '../../../lib/reminders';
import { colors, radius, spacing } from '../../../constants/theme';
import type { DayOfWeek, Meal } from '../../../types/domain';

const DAY_NAMES: DayOfWeek[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function HomeScreen() {
  const { user } = useAuth();
  const { isUnlocked } = useFinancialSession();
  const mealPlanQuery = useMealPlan();
  const waterQuery = useWaterData();
  const householdQuery = useHousehold();
  const logWater = useLogWater();
  const summaryQuery = useFinancialSummary();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([mealPlanQuery.refetch(), waterQuery.refetch(), householdQuery.refetch()]);
    setRefreshing(false);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const today = DAY_NAMES[new Date().getDay()];
  const todayMeals = mealPlanQuery.data?.days[today];

  const water = waterQuery.data?.waterLog;
  const waterConfig = waterQuery.data?.config;
  const glassSize = waterConfig?.glassSizeMl || 250;
  const glassesDrank = water ? Math.floor(water.totalMl / glassSize) : 0;
  const glassesTarget = waterConfig ? Math.floor(waterConfig.dailyTargetMl / glassSize) : 8;
  const waterPercent = waterConfig ? Math.min(100, Math.round(((water?.totalMl || 0) / waterConfig.dailyTargetMl) * 100)) : 0;

  const household = householdQuery.data;

  const [reminderStatus, setReminderStatus] = useState<'idle' | 'working' | 'on' | 'off' | 'denied'>('idle');
  const toggleReminders = async () => {
    if (!waterConfig) return;
    setReminderStatus('working');
    if (reminderStatus === 'on') {
      await disableWaterReminders();
      setReminderStatus('off');
      return;
    }
    const { scheduled } = await syncWaterReminders({ ...waterConfig, remindersEnabled: true });
    setReminderStatus(scheduled > 0 ? 'on' : 'denied');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.forest} />}
    >
      <AppText variant="title">{greeting}, {user?.name?.split(' ')[0] || 'there'} 👋</AppText>
      <AppText variant="body" color={colors.moss} style={styles.subtitle}>
        Kenyan meals, hydration, and your family budget — all in one place.
      </AppText>

      {/* Today's meals */}
      <View style={styles.sectionHeader}>
        <AppText variant="heading">Today&apos;s Meals</AppText>
        <Button label="Full Week →" variant="ghost" onPress={() => router.push('/(app)/(tabs)/meals')} style={styles.linkButton} />
      </View>
      <View style={styles.mealRow}>
        <MealSlot label="Breakfast" meal={todayMeals?.breakfast} day={today} slot="breakfast" />
        <MealSlot label="Lunch" meal={todayMeals?.lunch} day={today} slot="lunch" />
        <MealSlot label="Dinner" meal={todayMeals?.dinner} day={today} slot="dinner" />
      </View>

      {/* Hydration */}
      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.rowStart}>
            <Ionicons name="water" size={18} color={colors.blue} />
            <AppText variant="subheading" style={styles.cardTitleWithIcon}>Hydration</AppText>
          </View>
          <AppText variant="bodyBold" color={colors.blue}>{waterPercent}%</AppText>
        </View>
        <AppText variant="caption" color={colors.moss} style={styles.waterCaption}>
          {glassesDrank} / {glassesTarget} glasses today ({water?.totalMl || 0} / {waterConfig?.dailyTargetMl || 2000} ml)
        </AppText>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${waterPercent}%` }]} />
        </View>
        <View style={styles.waterButtons}>
          <Button label="+250 ml" variant="secondary" onPress={() => logWater.mutate(250)} loading={logWater.isPending} style={styles.waterButton} />
          <Button label="+500 ml" variant="secondary" onPress={() => logWater.mutate(500)} loading={logWater.isPending} style={styles.waterButton} />
        </View>
        {waterConfig ? (
          <Button
            label={
              reminderStatus === 'working' ? 'Working…'
              : reminderStatus === 'on' ? `Reminders on (${waterConfig.schedule.length}× daily) — tap to turn off`
              : reminderStatus === 'denied' ? 'Notification permission denied'
              : 'Enable on-device water reminders'
            }
            variant="ghost"
            onPress={toggleReminders}
            style={styles.reminderButton}
          />
        ) : null}
      </Card>

      {/* Family */}
      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={styles.rowStart}>
            <Ionicons name="people" size={18} color={colors.forest} />
            <AppText variant="subheading" style={styles.cardTitleWithIcon}>Your Family</AppText>
          </View>
          <AppText variant="caption" color={colors.forest}>{household?.members?.length ?? 0} members</AppText>
        </View>
        <AppText variant="caption" color={colors.moss} style={styles.familyCaption}>Tonight&apos;s dinner</AppText>
        <AppText variant="bodyBold">{todayMeals?.dinner?.name || 'No meal scheduled'}</AppText>
        <Button
          label="View Family & Preferences"
          variant="secondary"
          onPress={() => router.push('/(app)/(tabs)/more/family')}
          style={styles.familyButton}
        />
      </Card>

      {/* Budget privacy card */}
      {!isUnlocked ? (
        <Card style={[styles.card, styles.lockedCard]}>
          <View style={styles.rowStart}>
            <Ionicons name="lock-closed" size={16} color={colors.gold} />
            <AppText variant="label" color="#93C5FD">Privacy Protected</AppText>
          </View>
          <AppText variant="heading" color={colors.white} style={styles.lockedTitle}>Budget & Expenses</AppText>
          <AppText variant="body" color="#BFDBFE" style={styles.lockedBody}>
            Your salary, spending, and savings goals are private and PIN-protected.
          </AppText>
          <Button label="Unlock Budget with PIN" onPress={() => router.push('/budget-unlock')} style={styles.unlockButton} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.rowStart}>
              <Ionicons name="lock-open" size={16} color={colors.blue} />
              <AppText variant="subheading" color={colors.blue} style={styles.cardTitleWithIcon}>Budget Active</AppText>
            </View>
          </View>
          <View style={styles.budgetStatRow}>
            <AppText variant="caption" color={colors.moss}>Total Spent</AppText>
            <AppText variant="bodyBold">KSh {(summaryQuery.data?.totalSpentKsh ?? 0).toLocaleString()}</AppText>
          </View>
          <View style={styles.budgetStatRow}>
            <AppText variant="caption" color={colors.moss}>Remaining</AppText>
            <AppText variant="bodyBold" color={colors.forest}>KSh {(summaryQuery.data?.remainingKsh ?? 0).toLocaleString()}</AppText>
          </View>
          <Button label="Go to Budget Dashboard" variant="secondary" onPress={() => router.push('/(app)/(tabs)/budget')} style={styles.familyButton} />
        </Card>
      )}

      {/* Shopping shortcut */}
      <Card style={[styles.card, styles.shoppingCard]}>
        <View style={styles.rowStart}>
          <Ionicons name="basket" size={18} color={colors.forest} />
          <View style={styles.shoppingText}>
            <AppText variant="bodyBold">Family Shopping List</AppText>
            <AppText variant="caption" color={colors.moss}>Auto-built from this week&apos;s meals</AppText>
          </View>
          <Button label="Open" variant="ghost" onPress={() => router.push('/(app)/(tabs)/shopping')} />
        </View>
      </Card>
    </ScrollView>
  );
}

const MealSlot: React.FC<{ label: string; meal?: Meal; day: DayOfWeek; slot: string }> = ({ label, meal, day, slot }) => {
  if (!meal) {
    return (
      <View style={styles.mealSlotEmpty}>
        <AppText variant="caption" color={colors.moss}>{label}</AppText>
        <AppText variant="caption" color={colors.line}>No meal</AppText>
      </View>
    );
  }
  return (
    <View style={styles.mealSlot}>
      <AppText variant="label" color={colors.forest}>{label}</AppText>
      <AppText variant="caption" numberOfLines={2} style={styles.mealName}>{meal.name}</AppText>
      <View style={styles.mealSlotActions}>
        <Button label="Recipe" variant="secondary" onPress={() => router.push(`/recipe/${meal.id}`)} style={styles.mealActionButton} />
        <Button
          label="↻"
          variant="secondary"
          onPress={() => router.push({ pathname: '/swap', params: { day, mealType: slot, currentMealId: meal.id, mealName: meal.name } })}
          style={styles.mealSwapButton}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  subtitle: { marginTop: 4, marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  linkButton: { minHeight: 0, paddingHorizontal: 0 },
  mealRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  mealSlot: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.sm },
  mealSlotEmpty: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', padding: spacing.sm, alignItems: 'center', justifyContent: 'center', minHeight: 90 },
  mealName: { marginTop: 4, minHeight: 32 },
  mealSlotActions: { flexDirection: 'row', gap: 4, marginTop: spacing.xs },
  mealActionButton: { flex: 1, minHeight: 32, paddingHorizontal: 4 },
  mealSwapButton: { minHeight: 32, paddingHorizontal: 10 },
  card: { marginBottom: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitleWithIcon: { marginLeft: 2 },
  waterCaption: { marginTop: 4 },
  progressTrack: { height: 8, backgroundColor: colors.cream, borderRadius: 999, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.blue, borderRadius: 999 },
  waterButtons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  reminderButton: { marginTop: spacing.sm, minHeight: 34 },
  waterButton: { flex: 1 },
  familyCaption: { marginTop: spacing.sm },
  familyButton: { marginTop: spacing.md },
  lockedCard: { backgroundColor: '#172554', borderColor: '#1e3a8a' },
  lockedTitle: { marginTop: spacing.sm },
  lockedBody: { marginTop: 4, marginBottom: spacing.md },
  unlockButton: { backgroundColor: colors.gold },
  budgetStatRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  shoppingCard: { marginBottom: 0 },
  shoppingText: { flex: 1 },
});
