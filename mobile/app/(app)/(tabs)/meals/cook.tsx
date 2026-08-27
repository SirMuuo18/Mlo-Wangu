// What Can I Cook? — calls the existing POST /api/meals/what-can-i-cook,
// which does all the budget-fit scoring server-side (server.ts's route
// scales cost by household size and sorts by fit) — this screen only
// collects the inputs and renders the response, exactly like the web app's
// WhatCanICookView.tsx. No matching/scoring logic is reimplemented here.
import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '../../../../components/AppText';
import { Button } from '../../../../components/Button';
import { TextField } from '../../../../components/TextField';
import { EmptyState } from '../../../../components/EmptyState';
import { useHousehold } from '../../../../hooks/useHousehold';
import { useWhatCanICook } from '../../../../hooks/useMeals';
import { colors, radius, spacing } from '../../../../constants/theme';

const BUDGET_PRESETS = [150, 300, 500, 1000];

export default function CookScreen() {
  const householdQuery = useHousehold();
  const whatCanICook = useWhatCanICook();
  const [budgetKsh, setBudgetKsh] = useState(300);
  const [householdSize, setHouseholdSize] = useState(householdQuery.data?.members.length || 4);

  const handleSearch = () => {
    whatCanICook.mutate({ budgetKsh, householdSize, ingredients: [] });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppText variant="title">What Can I Cook?</AppText>
      <AppText variant="body" color={colors.moss} style={styles.subtitle}>
        Enter a budget and household size to see which Kenyan meals fit.
      </AppText>

      <TextField
        label="Budget (KSh)"
        value={String(budgetKsh)}
        onChangeText={(v) => setBudgetKsh(Math.max(0, Number(v.replace(/[^0-9]/g, '')) || 0))}
        keyboardType="number-pad"
      />
      <View style={styles.presetRow}>
        {BUDGET_PRESETS.map((preset) => (
          <Button
            key={preset}
            label={`KSh ${preset}`}
            variant={budgetKsh === preset ? 'primary' : 'secondary'}
            onPress={() => setBudgetKsh(preset)}
            style={styles.presetButton}
          />
        ))}
      </View>

      <TextField
        label="People Eating"
        value={String(householdSize)}
        onChangeText={(v) => setHouseholdSize(Math.max(1, Number(v.replace(/[^0-9]/g, '')) || 1))}
        keyboardType="number-pad"
      />

      <Button label="Find Meals" onPress={handleSearch} loading={whatCanICook.isPending} style={styles.searchButton} />

      {whatCanICook.isError ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          Could not search meals right now. Please try again.
        </AppText>
      ) : null}

      {whatCanICook.isSuccess ? (
        whatCanICook.data.meals.length === 0 ? (
          <EmptyState title="No matches" message="Try raising the budget slightly." />
        ) : (
          <View style={styles.results}>
            <AppText variant="caption" color={colors.moss} style={styles.resultsCaption}>
              {whatCanICook.data.matchedMealsCount} meals found
            </AppText>
            {whatCanICook.data.meals.map((meal) => (
              <View key={meal.id} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <AppText variant="bodyBold" style={styles.resultName}>{meal.name}</AppText>
                  <AppText variant="caption" color={meal.fitsBudget ? colors.forest : colors.gold}>
                    {meal.fitsBudget ? 'Fits budget' : 'Stretch'}
                  </AppText>
                </View>
                <AppText variant="caption" color={colors.moss}>
                  Est. KSh {meal.scaledCostKsh} · {meal.prepTimeMinutes} min
                </AppText>
                <Button
                  label="View Recipe"
                  variant="secondary"
                  onPress={() => router.push(`/recipe/${meal.id}`)}
                  style={styles.resultButton}
                />
              </View>
            ))}
          </View>
        )
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  subtitle: { marginTop: 4, marginBottom: spacing.lg },
  presetRow: { flexDirection: 'row', gap: spacing.xs, marginTop: -spacing.sm, marginBottom: spacing.md },
  presetButton: { flex: 1, minHeight: 34, paddingHorizontal: 4 },
  searchButton: { marginTop: spacing.sm, marginBottom: spacing.lg },
  error: { marginBottom: spacing.md },
  results: { gap: spacing.md },
  resultsCaption: { marginBottom: spacing.xs },
  resultCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  resultHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  resultName: { flex: 1, marginRight: spacing.sm },
  resultButton: { marginTop: spacing.sm },
});
