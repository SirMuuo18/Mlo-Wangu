// Guard: bounces an already-authenticated (and onboarded) user away from
// the auth screens — e.g. if they background the app on Login and reopen it
// with a still-valid session. Mirrors the guard pattern used by
// (app)/_layout.tsx and onboarding/_layout.tsx so no single route has to be
// trusted as the only enforcement point.
import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../../context/AuthContext';

export default function AuthLayout() {
  const { status, user } = useAuth();

  if (status === 'restoring') return <LoadingState />;
  if (status === 'authenticated') {
    return <Redirect href={user?.onboardingComplete ? '/(app)/(tabs)/home' : '/onboarding'} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
