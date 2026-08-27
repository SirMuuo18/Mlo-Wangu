import React from 'react';
import { Stack } from 'expo-router';

export default function MealsStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="cook" options={{ headerShown: true, title: 'What Can I Cook?' }} />
    </Stack>
  );
}
