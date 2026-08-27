// Server-state cache for ordinary application data (meals, shopping,
// household, water). Deliberately NOT used for authentication state —
// AuthContext (context/AuthContext.tsx) stays the single source of truth
// for who's signed in, per Phase 2's instructions. Financial data uses its
// own, more conservative staleTime (see hooks/useFinancial.ts) rather than
// this default, since it must never be presented stale as if authoritative.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 1 minute — reasonable for meal/shopping/household data
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false, // no browser window to focus on native
    },
    mutations: {
      retry: 0, // never silently retry a write — see the "no fake success" rule
    },
  },
});

// Central query key registry — keeps invalidation call sites consistent
// instead of hand-typing the same array in multiple screens/hooks.
export const queryKeys = {
  mealPlan: ['mealPlan', 'current'] as const,
  meals: (params?: { category?: string; costLevel?: string; search?: string }) => ['meals', params ?? {}] as const,
  meal: (id: string) => ['meals', 'detail', id] as const,
  entitlementStatus: ['mealPlan', 'entitlementStatus'] as const,
  shoppingList: ['shoppingList', 'current'] as const,
  household: ['household'] as const,
  water: ['water', 'today'] as const,
  financialStatus: ['financial', 'status'] as const,
  budget: (month?: string) => ['financial', 'budget', month ?? 'current'] as const,
  expenses: (month?: string) => ['financial', 'expenses', month ?? 'current'] as const,
  financialSummary: (month?: string) => ['financial', 'summary', month ?? 'current'] as const,
};
