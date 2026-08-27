// Root layout — wraps the whole app in AuthProvider and keeps the native
// splash screen visible until session restoration finishes, so a protected
// screen can never flash before we know whether the user is signed in
// (Section 07/18 of the audit's requirements).
import React, { useCallback, useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { FinancialSessionProvider } from '../context/FinancialSessionContext';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden / not supported on this platform — safe to ignore.
});

function RootLayoutInner() {
  const { status } = useAuth();

  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (status !== 'restoring') hideSplash();
  }, [status, hideSplash]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="recipe/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Recipe' }} />
        <Stack.Screen name="swap" options={{ presentation: 'modal', headerShown: true, title: 'Swap Meal' }} />
        <Stack.Screen name="generate-plan" options={{ presentation: 'modal', headerShown: true, title: 'Generate New Plan' }} />
        <Stack.Screen name="budget-unlock" options={{ presentation: 'modal', headerShown: true, title: 'Unlock Budget' }} />
        <Stack.Screen name="budget-setup-pin" options={{ presentation: 'modal', headerShown: true, title: 'Create Budget PIN' }} />
        <Stack.Screen name="log-expense" options={{ presentation: 'modal', headerShown: true, title: 'Log Expense' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <FinancialSessionProvider>
          <RootLayoutInner />
        </FinancialSessionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
