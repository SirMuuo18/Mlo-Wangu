import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

export function useMeals(params?: { category?: string; costLevel?: string; search?: string }) {
  return useQuery({
    queryKey: queryKeys.meals(params),
    queryFn: () => api.getMeals(params).then((r) => r.meals),
  });
}

export function useMeal(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.meal(id ?? ''),
    queryFn: () => api.getMealById(id as string).then((r) => r.meal),
    enabled: !!id,
  });
}

// A one-off lookup triggered by user input (budget/portions/pantry), not a
// standing cached resource — mirrors the web app's own on-demand
// api.whatCanICook() call, so this is a mutation (fired on "Find Meals"),
// not a query with a giant dynamic key.
export function useWhatCanICook() {
  return useMutation({
    mutationFn: (data: { budgetKsh: number; householdSize?: number; ingredients?: string[] }) => api.whatCanICook(data),
  });
}
