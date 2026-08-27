import React from 'react';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from '../../../../components/AppText';
import { Button } from '../../../../components/Button';
import { LoadingState } from '../../../../components/LoadingState';
import { ErrorState } from '../../../../components/ErrorState';
import { EmptyState } from '../../../../components/EmptyState';
import { useFinancialSession } from '../../../../context/FinancialSessionContext';
import { useExpenses, useDeleteExpense } from '../../../../hooks/useFinancial';
import { colors, spacing } from '../../../../constants/theme';

export default function ExpensesScreen() {
  const { isUnlocked } = useFinancialSession();
  const expensesQuery = useExpenses();
  const deleteExpense = useDeleteExpense();

  if (!isUnlocked) return <ErrorState message="Budget is locked." />;
  if (expensesQuery.isLoading) return <LoadingState label="Loading expenses…" />;
  if (expensesQuery.isError) return <ErrorState message="Could not load expenses." onRetry={expensesQuery.refetch} />;

  const expenses = expensesQuery.data ?? [];

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={expenses}
      keyExtractor={(e) => e.id}
      ListHeaderComponent={
        <Button label="+ Log New Expense" onPress={() => router.push('/log-expense')} style={styles.addButton} />
      }
      ListEmptyComponent={<EmptyState title="No expenses yet" message="Logged expenses will appear here." />}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowText}>
            <AppText variant="bodyBold">{item.description}</AppText>
            <AppText variant="caption" color={colors.moss}>{item.category} · {item.date}</AppText>
          </View>
          <AppText variant="bodyBold">- KSh {item.amountKsh.toLocaleString()}</AppText>
          <Pressable onPress={() => deleteExpense.mutate(item.id)} style={styles.deleteButton}>
            <Ionicons name="trash" size={16} color={colors.danger} />
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  addButton: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowText: { flex: 1 },
  deleteButton: { padding: spacing.xs },
});
