// Private Budget dashboard — locked by default, exactly like the web app's
// BudgetView.tsx. Unlocking, category editing, and every number shown here
// all go through the server (requireFinancialSession-gated endpoints); this
// screen never decides on its own whether the PIN was correct or the
// session is still valid (Section 11 of the Phase 2 brief).
import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../../components/AppText';
import { Card } from '../../../../components/Card';
import { Button } from '../../../../components/Button';
import { TextField } from '../../../../components/TextField';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { useAuth } from '../../../../context/AuthContext';
import { useFinancialSession } from '../../../../context/FinancialSessionContext';
import { useBudget, useUpdateBudget, useFinancialSummary } from '../../../../hooks/useFinancial';
import { colors, radius, spacing } from '../../../../constants/theme';

const ALL_CATEGORIES = ['Food', 'Rent', 'Transport', 'Bills', 'Shopping', 'Entertainment', 'Health', 'Savings', 'Debt', 'Other'];
const CATEGORY_COLORS: Record<string, string> = {
  Food: '#14532D', Rent: '#3B82F6', Transport: '#F59E0B', Bills: '#8B5CF6',
  Shopping: '#EC4899', Entertainment: '#06B6D4', Health: '#DC2626',
  Savings: '#10B981', Debt: '#EF4444', Other: '#6B7280',
};

function LockedView() {
  const { user } = useAuth();
  return (
    <View style={styles.lockedScreen}>
      <View style={styles.lockedIcon}>
        <Ionicons name="lock-closed" size={32} color={colors.gold} />
      </View>
      <AppText variant="label" color="#93C5FD">Protected Financial Records</AppText>
      <AppText variant="title" color={colors.white} style={styles.lockedTitle}>Private Budget Locked</AppText>
      <AppText variant="body" color="#BFDBFE" style={styles.lockedBody}>
        Your salary, expenses, and savings targets are strictly private to you.
      </AppText>
      <Button
        label={user?.hasBudgetPin ? 'Enter PIN to Unlock' : 'Create Your Budget PIN'}
        onPress={() => router.push(user?.hasBudgetPin ? '/budget-unlock' : '/budget-setup-pin')}
        style={styles.unlockButton}
      />
      {user?.hasBudgetPin ? (
        <Button label="Change or Reset PIN" variant="ghost" onPress={() => router.push('/budget-setup-pin')} />
      ) : null}
    </View>
  );
}

function UnlockedView() {
  const { lock } = useFinancialSession();
  const budgetQuery = useBudget();
  const summaryQuery = useFinancialSummary();
  const updateBudget = useUpdateBudget();
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [editingIncome, setEditingIncome] = useState(false);
  const [incomeInput, setIncomeInput] = useState('');

  if (budgetQuery.isLoading || summaryQuery.isLoading) return <LoadingState label="Loading your budget…" />;
  if (budgetQuery.isError || summaryQuery.isError) {
    return <ErrorState message="Could not load your budget." onRetry={() => { budgetQuery.refetch(); summaryQuery.refetch(); }} />;
  }

  const summary = summaryQuery.data;
  const analysis = summary?.analysis;
  const budget = budgetQuery.data;

  const saveIncome = async () => {
    const amount = Number(incomeInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    await updateBudget.mutateAsync({
      ...(budget || { id: '', userId: '', month: new Date().toISOString().slice(0, 7), categories: [], updatedAt: '' }),
      monthlyIncomeKsh: Math.round(amount),
      incomeType: budget?.incomeType || 'monthly',
    });
    setEditingIncome(false);
  };

  const saveCategory = async (category: string) => {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount < 0) return;
    const base = budget || { id: '', userId: '', month: new Date().toISOString().slice(0, 7), monthlyIncomeKsh: 0, incomeType: 'monthly' as const, categories: [], updatedAt: '' };
    const idx = base.categories.findIndex((c) => c.category === category);
    const categories = idx >= 0
      ? base.categories.map((c, i) => (i === idx ? { ...c, plannedAmountKsh: Math.round(amount) } : c))
      : [...base.categories, { category: category as any, plannedAmountKsh: Math.round(amount), color: CATEGORY_COLORS[category] || '#6B7280' }];
    await updateBudget.mutateAsync({ ...base, categories });
    setEditingCategory(null);
  };

  const existingCategories = new Set(Object.keys(summary?.categoryBreakdown || {}));
  const missingCategories = ALL_CATEGORIES.filter((c) => !existingCategories.has(c));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <AppText variant="title">Budget</AppText>
        <Button label="Lock" variant="secondary" onPress={lock} style={styles.lockButton} />
      </View>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <View style={styles.statHeader}>
            <AppText variant="label" color={colors.moss}>Income</AppText>
            <Button label="✎" variant="ghost" onPress={() => { setIncomeInput(String(summary?.totalIncomeKsh || '')); setEditingIncome(true); }} style={styles.editIcon} />
          </View>
          {editingIncome ? (
            <View>
              <TextField label="" value={incomeInput} onChangeText={setIncomeInput} keyboardType="number-pad" placeholder="e.g. 50000" />
              <View style={styles.inlineButtons}>
                <Button label="Save" onPress={saveIncome} loading={updateBudget.isPending} style={styles.inlineButton} />
                <Button label="Cancel" variant="ghost" onPress={() => setEditingIncome(false)} style={styles.inlineButton} />
              </View>
            </View>
          ) : (
            <AppText variant="heading">KSh {(summary?.totalIncomeKsh ?? 0).toLocaleString()}</AppText>
          )}
        </Card>
        <Card style={styles.statCard}>
          <AppText variant="label" color={colors.moss}>Remaining</AppText>
          <AppText variant="heading" color={colors.forest}>KSh {(summary?.remainingKsh ?? 0).toLocaleString()}</AppText>
        </Card>
      </View>

      {analysis ? (
        <Card style={[styles.card, analysis.isOverspending ? styles.warningCard : styles.okCard]}>
          <View style={styles.rowStart}>
            <Ionicons name={analysis.isOverspending ? 'warning' : 'trending-down'} size={18} color={analysis.isOverspending ? '#92400E' : '#166534'} />
            <AppText variant="bodyBold" style={styles.analysisTitle}>
              {analysis.isOverspending ? 'Spending Alert' : 'Healthy Pace'}
            </AppText>
          </View>
          <AppText variant="caption" style={styles.analysisMessage}>{analysis.alertMessage}</AppText>
        </Card>
      ) : null}

      <View style={styles.sectionHeader}>
        <AppText variant="heading">Categories</AppText>
        <Button label="+ Log Expense" onPress={() => router.push('/log-expense')} style={styles.logExpenseButton} />
      </View>

      {Object.entries(summary?.categoryBreakdown || {}).map(([catKey, data]) => {
        const spent = data.spent ?? 0;
        const planned = data.planned ?? 0;
        const percent = planned > 0 ? Math.min(100, Math.round((spent / planned) * 100)) : 0;
        const isOver = spent > planned;
        return (
          <Card key={catKey} style={styles.categoryCard}>
            <View style={styles.rowBetween}>
              <AppText variant="bodyBold">{catKey}</AppText>
              {editingCategory === catKey ? (
                <View style={styles.inlineEdit}>
                  <TextField label="" value={amountInput} onChangeText={setAmountInput} keyboardType="number-pad" style={styles.inlineInput} />
                  <Button label="✓" onPress={() => saveCategory(catKey)} loading={updateBudget.isPending} style={styles.iconOnlyButton} />
                </View>
              ) : (
                <View style={styles.rowStart}>
                  <AppText variant="caption">KSh {spent.toLocaleString()} / {planned.toLocaleString()}</AppText>
                  <Button label="✎" variant="ghost" onPress={() => { setEditingCategory(catKey); setAmountInput(String(planned)); }} style={styles.editIcon} />
                </View>
              )}
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: isOver ? colors.danger : colors.forest }]} />
            </View>
          </Card>
        );
      })}

      {missingCategories.length > 0 ? (
        <View style={styles.missingRow}>
          <AppText variant="caption" color={colors.moss} style={styles.missingLabel}>Set a budget for:</AppText>
          <View style={styles.missingButtons}>
            {editingCategory && missingCategories.includes(editingCategory) ? (
              <View style={styles.inlineEdit}>
                <AppText variant="bodyBold">{editingCategory}</AppText>
                <TextField label="" value={amountInput} onChangeText={setAmountInput} keyboardType="number-pad" style={styles.inlineInput} placeholder="e.g. 5000" />
                <Button label="Save" onPress={() => saveCategory(editingCategory)} loading={updateBudget.isPending} style={styles.iconOnlyButton} />
              </View>
            ) : (
              missingCategories.map((c) => (
                <Button key={c} label={`+ ${c}`} variant="secondary" onPress={() => { setEditingCategory(c); setAmountInput(''); }} style={styles.missingButton} />
              ))
            )}
          </View>
        </View>
      ) : null}

      <Button label="View All Expenses" variant="secondary" onPress={() => router.push('/(app)/(tabs)/budget/expenses')} style={styles.expensesButton} />
    </ScrollView>
  );
}

export default function BudgetScreen() {
  const { isChecking, isUnlocked } = useFinancialSession();
  if (isChecking) return <LoadingState label="Checking budget session…" />;
  return isUnlocked ? <UnlockedView /> : <LockedView />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  lockedScreen: { flex: 1, backgroundColor: '#172554', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  lockedIcon: { width: 64, height: 64, borderRadius: radius.xl, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  lockedTitle: { marginTop: spacing.sm, textAlign: 'center' },
  lockedBody: { marginTop: spacing.sm, marginBottom: spacing.xl, textAlign: 'center' },
  unlockButton: { backgroundColor: colors.gold, alignSelf: 'stretch', marginBottom: spacing.sm },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  lockButton: { minHeight: 36, paddingHorizontal: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: { flex: 1 },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editIcon: { minHeight: 0, paddingHorizontal: 6 },
  inlineButtons: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  inlineButton: { flex: 1, minHeight: 32 },
  card: { marginBottom: spacing.md },
  warningCard: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  okCard: { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' },
  rowStart: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  analysisTitle: { color: colors.ink },
  analysisMessage: { marginTop: 4, color: colors.ink },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  logExpenseButton: { minHeight: 36, paddingHorizontal: spacing.md },
  categoryCard: { marginBottom: spacing.sm },
  progressTrack: { height: 6, backgroundColor: colors.cream, borderRadius: 999, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  inlineEdit: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  inlineInput: { width: 90, marginBottom: 0 },
  iconOnlyButton: { minHeight: 32, paddingHorizontal: spacing.sm },
  missingRow: { marginTop: spacing.sm, marginBottom: spacing.lg },
  missingLabel: { marginBottom: spacing.xs },
  missingButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  missingButton: { minHeight: 34, paddingHorizontal: spacing.sm },
  expensesButton: { marginTop: spacing.sm },
});
