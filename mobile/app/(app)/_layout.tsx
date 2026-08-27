// Guard for the entire authenticated app shell — redirects to login or
// onboarding if either condition isn't met, independent of app/index.tsx's
// own decision (defense in depth against a deep link landing directly on a
// protected route).
import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const { status, user } = useAuth();

  if (status === 'restoring') return <LoadingState />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/login" />;
  if (!user?.onboardingComplete) return <Redirect href="/onboarding" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
