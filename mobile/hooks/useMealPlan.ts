import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

export function useMealPlan() {
  return useQuery({
    queryKey: queryKeys.mealPlan,
    queryFn: () => api.getCurrentMealPlan().then((r) => r.mealPlan),
  });
}

export function useEntitlementStatus() {
  return useQuery({
    queryKey: queryKeys.entitlementStatus,
    queryFn: () => api.getGenerationEntitlementStatus(),
    // Same "UX shortcut only" caveat as web: this is never the actual
    // authority — /api/meal-plans/generate re-checks regardless. Short
    // staleTime since it directly gates a payment decision.
    staleTime: 10_000,
  });
}

// GATED server-side. This never marks itself successful without a real
// 200 from the server, and never fabricates/consumes an entitlement
// locally — a 402 (ApiError with code PAYMENT_REQUIRED) is expected,
// correct behavior, not a bug, and must be surfaced to the caller as-is.
export function useGenerateMealPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.generateMealPlan(),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.mealPlan, data.mealPlan);
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList });
      queryClient.invalidateQueries({ queryKey: queryKeys.entitlementStatus });
    },
  });
}

export function useSwapMeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { day: string; mealType: string; currentMealId: string; reason?: 'cheaper' | 'faster' | 'random' }) =>
      api.swapMeal(data),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.mealPlan, data.mealPlan);
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList });
    },
  });
}

// Meal-Variety Engine v1 — starring a week protects it from being
// overwritten by a future regenerate/swap (server returns 409 if it's
// already starred); starring a meal softens its cross-week repetition
// penalty in future generations without forcing it to repeat.
export function useToggleWeekStar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { weekStartDate: string; starred: boolean }) =>
      input.starred ? api.unstarMealPlanWeek(input.weekStartDate) : api.starMealPlanWeek(input.weekStartDate),
    onSuccess: (_data, input) => {
      queryClient.setQueryData(queryKeys.mealPlan, (prev: any) => (prev ? { ...prev, isStarred: !input.starred } : prev));
    },
  });
}

export function useStarredMeals() {
  return useQuery({
    queryKey: queryKeys.starredMeals,
    queryFn: () => api.getStarredMeals().then((r) => new Set(r.mealIds)),
  });
}

export function useToggleMealStar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { mealId: string; starred: boolean }) =>
      input.starred ? api.unstarMeal(input.mealId) : api.starMeal(input.mealId),
    onSuccess: (_data, input) => {
      queryClient.setQueryData(queryKeys.starredMeals, (prev: Set<string> | undefined) => {
        const next = new Set(prev ?? []);
        if (input.starred) next.delete(input.mealId); else next.add(input.mealId);
        return next;
      });
    },
  });
}

export { ApiError };
