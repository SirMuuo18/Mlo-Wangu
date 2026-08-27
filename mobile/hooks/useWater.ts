import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';

export function useWaterData() {
  return useQuery({
    queryKey: queryKeys.water,
    queryFn: () => api.getWaterData(),
  });
}

// Manual logging only — no proactive/scheduled reminder is implemented or
// claimed here (none exists server-side either; see the Expo Readiness
// Audit's Notifications section).
export function useLogWater() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amountMl: number) => api.logWater(amountMl).then((r) => r.waterLog),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.water });
    },
  });
}
