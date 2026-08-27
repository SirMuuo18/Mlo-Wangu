// Mobile-first tab bar — 5 destinations, not a port of the web sidebar's 7
// items. "What Can I Cook?" nests inside Meals (it's a meal-discovery tool,
// not a daily destination) and "Family" nests inside More, alongside
// account/sign-out — mirroring how the web app's own bottom nav already
// omits AI Assistant and treats Family as secondary. See the Expo Readiness
// Audit, Section 09.
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.moss,
        tabBarStyle: { borderTopColor: colors.line, backgroundColor: colors.surface },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="meals"
        options={{ title: 'Meals', tabBarIcon: ({ color, size }) => <Ionicons name="restaurant" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ title: 'Shopping', tabBarIcon: ({ color, size }) => <Ionicons name="basket" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="budget"
        options={{ title: 'Budget', tabBarIcon: ({ color, size }) => <Ionicons name="wallet" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ionicons name="menu" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
