import React from 'react';
import { Stack } from 'expo-router';

export default function MoreStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="account" options={{ headerShown: true, title: 'Account Settings' }} />
      <Stack.Screen name="reminders" options={{ headerShown: true, title: 'Reminders' }} />
      <Stack.Screen name="family" options={{ headerShown: true, title: 'Family Household' }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: 'Notifications' }} />
      <Stack.Screen name="ai-assistant" options={{ headerShown: true, title: 'Mlo Wangu Assistant' }} />
      <Stack.Screen name="about" options={{ headerShown: true, title: 'About Us' }} />
      <Stack.Screen name="faq" options={{ headerShown: true, title: 'FAQ' }} />
      <Stack.Screen name="contact" options={{ headerShown: true, title: 'Contact & Support' }} />
    </Stack>
  );
}
