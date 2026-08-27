import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '../../components/LoadingState';
import { useAuth } from '../../context/AuthContext';

export default function OnboardingLayout() {
  const { status, user } = useAuth();

  if (status === 'restoring') return <LoadingState />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/login" />;
  if (user?.onboardingComplete) return <Redirect href="/(app)/(tabs)/home" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
