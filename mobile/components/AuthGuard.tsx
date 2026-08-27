// Lightweight guard for the root-level modal routes (recipe, swap, budget
// unlock/setup, log-expense) — these sit outside the (app) group's own
// layout guard since they need to be presentable as modals over any tab.
// Real authorization is still 100% server-side on every API call; this only
// prevents an unauthenticated deep link from rendering a screen that would
// just fail its own data fetch anyway.
import React from 'react';
import { Redirect } from 'expo-router';
import { LoadingState } from './LoadingState';
import { useAuth } from '../context/AuthContext';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status } = useAuth();
  if (status === 'restoring') return <LoadingState />;
  if (status === 'unauthenticated') return <Redirect href="/(auth)/login" />;
  return <>{children}</>;
};
