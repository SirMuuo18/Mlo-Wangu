import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { Household } from '../types/domain';

export function useHousehold() {
  return useQuery({
    queryKey: queryKeys.household,
    queryFn: () => api.getHousehold().then((r) => r.household),
  });
}

// Whole-object replace, same single-owner model as the web app — no
// invite/sharing/multi-owner concept exists server-side to build a UI for.
export function useUpdateHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (household: Household) => api.updateHousehold(household).then((r) => r.household),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.household, saved);
    },
  });
}
