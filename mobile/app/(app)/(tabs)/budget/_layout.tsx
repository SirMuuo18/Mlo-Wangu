import React from 'react';
import { Stack } from 'expo-router';

export default function BudgetStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="expenses" options={{ headerShown: true, title: 'Expenses' }} />
    </Stack>
  );
}
