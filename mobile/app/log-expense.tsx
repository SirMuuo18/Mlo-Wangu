import React, { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AuthGuard } from '../components/AuthGuard';
import { Screen } from '../components/Screen';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { useAddExpense } from '../hooks/useFinancial';
import { colors, spacing } from '../constants/theme';
import type { ExpenseCategory } from '../types/domain';

const CATEGORIES: ExpenseCategory[] = ['Food', 'Rent', 'Transport', 'Bills', 'Shopping', 'Entertainment', 'Health', 'Savings', 'Debt', 'Other'];

function LogExpenseContent() {
  const addExpense = useAddExpense();
  const [amountKsh, setAmountKsh] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Food');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const amount = Number(amountKsh);
    if (!amount || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (!description.trim()) {
      setError('Enter a short description.');
      return;
    }
    setError(null);
    try {
      await addExpense.mutateAsync({ amountKsh: amount, category, description: description.trim() });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log this expense. Please try again.');
    }
  };

  return (
    <Screen scroll>
      <AppText variant="heading" style={styles.title}>Log Household Expense</AppText>

      <TextField label="Amount (KSh)" value={amountKsh} onChangeText={setAmountKsh} keyboardType="number-pad" placeholder="e.g. 450" />

      <AppText variant="label" color={colors.moss} style={styles.categoryLabel}>Category</AppText>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            label={cat}
            variant={category === cat ? 'primary' : 'secondary'}
            onPress={() => setCategory(cat)}
            style={styles.categoryButton}
          />
        ))}
      </View>

      <TextField label="Description" value={description} onChangeText={setDescription} placeholder="e.g. Vegetable market shopping" />

      {error ? <AppText variant="caption" color={colors.danger} style={styles.error}>{error}</AppText> : null}

      <Button label="Record Expense" onPress={handleSubmit} loading={addExpense.isPending} />
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} style={styles.cancel} />
    </Screen>
  );
}

export default function LogExpenseScreen() {
  return (
    <AuthGuard>
      <LogExpenseContent />
    </AuthGuard>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  categoryLabel: { marginBottom: spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  categoryButton: { minHeight: 36, paddingHorizontal: spacing.sm },
  error: { marginBottom: spacing.md },
  cancel: { marginTop: spacing.sm },
});
