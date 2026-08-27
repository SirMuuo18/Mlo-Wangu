// The entry decider: `/` never renders its own UI — it only ever redirects,
// based on the real auth/onboarding state from AuthContext (which itself
// comes from the server's GET /api/auth/me, not a locally-invented flag).
import React from 'react';
import { Redirect } from 'expo-router';
import { LoadingState } from '../components/LoadingState';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const { status, user } = useAuth();

  if (status === 'restoring') return <LoadingState />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/login" />;
  if (!user?.onboardingComplete) return <Redirect href="/onboarding" />;
  return <Redirect href="/(app)/(tabs)/home" />;
}
