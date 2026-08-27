// Financial data hooks — every one of these requires a valid, server-issued
// financial-session token (Section 10/11/12 of the Phase 2 brief). None of
// them decide locally whether the token is valid; a 401/403 with
// `budgetLocked: true` from the server is treated as authoritative and
// immediately drops back to the locked state via FinancialSessionContext's
// handleExpired() — never silently retried with the same (known-bad) token.
//
// staleTime is 0 and refetchOnMount is 'always': this data is explicitly
// exempted from the app-wide 1-minute cache (lib/queryClient.ts) because it
// must never be shown as current when it might be stale.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import { useFinancialSession } from '../context/FinancialSessionContext';
import type { UserBudget, Expense } from '../types/domain';

function isSessionDead(err: unknown): boolean {
  return err instanceof ApiError && err.budgetLocked === true;
}

export function useBudget(month?: string) {
  const { token, isUnlocked, handleExpired } = useFinancialSession();
  return useQuery({
    queryKey: queryKeys.budget(month),
    queryFn: async () => {
      try {
        return await api.getBudget(token as string, month).then((r) => r.budget);
      } catch (err) {
        if (isSessionDead(err)) await handleExpired();
        throw err;
      }
    },
    enabled: isUnlocked && !!token,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useUpdateBudget() {
  const { token, handleExpired } = useFinancialSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (budget: UserBudget) => {
      try {
        return await api.updateBudget(token as string, budget);
      } catch (err) {
        if (isSessionDead(err)) await handleExpired();
        throw err;
      }
    },
    onSuccess: (res) => {
      queryClient.setQueryData(queryKeys.budget(), res.budget);
      queryClient.invalidateQueries({ queryKey: queryKeys.financialSummary() });
    },
  });
}

export function useExpenses(month?: string) {
  const { token, isUnlocked, handleExpired } = useFinancialSession();
  return useQuery({
    queryKey: queryKeys.expenses(month),
    queryFn: async () => {
      try {
        return await api.getExpenses(token as string, month).then((r) => r.expenses);
      } catch (err) {
        if (isSessionDead(err)) await handleExpired();
        throw err;
      }
    },
    enabled: isUnlocked && !!token,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useAddExpense() {
  const { token, handleExpired } = useFinancialSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { amountKsh: number; category: string; description: string; date?: string }) => {
      try {
        return await api.addExpense(token as string, data).then((r) => r.expense);
      } catch (err) {
        if (isSessionDead(err)) await handleExpired();
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses() });
      queryClient.invalidateQueries({ queryKey: queryKeys.financialSummary() });
    },
  });
}

export function useDeleteExpense() {
  const { token, handleExpired } = useFinancialSession();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        return await api.deleteExpense(token as string, id);
      } catch (err) {
        if (isSessionDead(err)) await handleExpired();
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses() });
      queryClient.invalidateQueries({ queryKey: queryKeys.financialSummary() });
    },
  });
}

export function useFinancialSummary(month?: string) {
  const { token, isUnlocked, handleExpired } = useFinancialSession();
  return useQuery({
    queryKey: queryKeys.financialSummary(month),
    queryFn: async () => {
      try {
        return await api.getFinancialSummary(token as string, month);
      } catch (err) {
        if (isSessionDead(err)) await handleExpired();
        throw err;
      }
    },
    enabled: isUnlocked && !!token,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export type { UserBudget, Expense };
