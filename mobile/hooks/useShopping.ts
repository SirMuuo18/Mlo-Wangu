import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryClient';
import type { ShoppingList } from '../types/domain';

export function useShoppingList() {
  return useQuery({
    queryKey: queryKeys.shoppingList,
    queryFn: () => api.getShoppingList().then((r) => r.shoppingList),
  });
}

// Whole-list PUT, same as the web app — there is no per-item PATCH endpoint
// to preserve. Optimistic update on the toggle itself for a snappy tap, but
// always reconciled with (never assumed ahead of) the server's response —
// on failure the previous server-confirmed list is restored, never left
// showing an unconfirmed change as if it were saved.
export function useUpdateShoppingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (list: ShoppingList) => api.updateShoppingList(list).then((r) => r.shoppingList),
    onMutate: async (optimisticList) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.shoppingList });
      const previous = queryClient.getQueryData<ShoppingList | null>(queryKeys.shoppingList);
      queryClient.setQueryData(queryKeys.shoppingList, optimisticList);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(queryKeys.shoppingList, context.previous);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.shoppingList, saved);
    },
  });
}
