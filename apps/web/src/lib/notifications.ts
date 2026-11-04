import { NotificationListSchema } from '@itsm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
export function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiFetch('/api/notifications', NotificationListSchema),
  });
}
export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(
        `/api/notifications/${id}/read`,
        { parse: (value: unknown) => value },
        { method: 'POST' },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(
        '/api/notifications/read-all',
        { parse: (value: unknown) => value },
        { method: 'POST' },
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
