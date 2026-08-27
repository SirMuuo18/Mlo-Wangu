// Budget-PIN / financial-session state — deliberately separate from
// AuthContext (which owns identity/sign-in only), mirroring how the web app
// keeps `isBudgetUnlocked` in AppContext rather than AuthContext. The
// server is the sole authority on whether a PIN is correct or a session is
// still valid (Section 11 of the Phase 2 brief) — this context only tracks
// "do we currently hold a token the server told us is valid" and reacts
// when the server later says otherwise.
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { getFinancialToken, setFinancialToken, clearFinancialToken } from '../lib/financialSession';
import { useQueryClient } from '@tanstack/react-query';

interface FinancialSessionContextType {
  isUnlocked: boolean;
  isChecking: boolean;
  // Never logged, never rendered — only read by lib/api.ts's financial
  // calls via the hooks in hooks/useFinancial.ts.
  token: string | null;
  unlock: (pin: string) => Promise<void>; // throws with a user-facing message on failure
  setupPin: (pin: string, confirmPin: string) => Promise<void>;
  lock: () => Promise<void>;
  // Called by a financial query/mutation when the server reports the
  // session is gone (BUDGET_LOCKED / SESSION_EXPIRED) — resets to locked
  // and drops the now-known-bad token, per Section 12's exact requirement.
  handleExpired: () => Promise<void>;
}

const FinancialSessionContext = createContext<FinancialSessionContextType | undefined>(undefined);

export const FinancialSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const resetToLocked = useCallback(async () => {
    await clearFinancialToken();
    setToken(null);
    setIsUnlocked(false);
    // Drop any cached financial data immediately — never let a screen keep
    // showing numbers fetched under a session that's now known to be dead.
    queryClient.removeQueries({ queryKey: ['financial'] });
  }, [queryClient]);

  // On mount: if a token survived from a previous app session, ask the
  // server whether it's still valid before trusting it for anything.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await getFinancialToken();
      if (!stored) {
        if (mounted) setIsChecking(false);
        return;
      }
      try {
        const { isUnlocked: valid } = await api.checkFinancialStatus(stored);
        if (!mounted) return;
        if (valid) {
          setToken(stored);
          setIsUnlocked(true);
        } else {
          await resetToLocked();
        }
      } catch {
        if (mounted) await resetToLocked();
      } finally {
        if (mounted) setIsChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [resetToLocked]);

  const unlock = useCallback(async (pin: string) => {
    let res;
    try {
      res = await api.unlockBudget(pin);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Could not unlock the budget. Please try again.');
    }
    if (!res.unlocked || !res.financialToken) {
      throw new Error('Incorrect PIN. Access denied.');
    }
    await setFinancialToken(res.financialToken);
    setToken(res.financialToken);
    setIsUnlocked(true);
  }, []);

  const setupPin = useCallback(async (pin: string, confirmPin: string) => {
    let res;
    try {
      res = await api.setupBudgetPin(pin, confirmPin);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Could not save the PIN. Please try again.');
    }
    if (!res.success || !res.financialToken) {
      throw new Error('Could not save the PIN. Please try again.');
    }
    await setFinancialToken(res.financialToken);
    setToken(res.financialToken);
    setIsUnlocked(true);
  }, []);

  const lock = useCallback(async () => {
    if (token) {
      try { await api.lockBudget(token); } catch { /* best-effort, same as web's lockBudget() */ }
    }
    await resetToLocked();
  }, [token, resetToLocked]);

  return (
    <FinancialSessionContext.Provider value={{ isUnlocked, isChecking, token, unlock, setupPin, lock, handleExpired: resetToLocked }}>
      {children}
    </FinancialSessionContext.Provider>
  );
};

export function useFinancialSession(): FinancialSessionContextType {
  const ctx = useContext(FinancialSessionContext);
  if (!ctx) throw new Error('useFinancialSession must be used within a FinancialSessionProvider');
  return ctx;
}
