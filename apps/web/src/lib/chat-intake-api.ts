import { ChatIntakeResponseSchema } from '@itsm/contracts';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from './api';

export function useChatIntake() {
  return useMutation({
    mutationFn: async (message: string) => {
      try {
        return await apiFetch('/api/incidents/intake', ChatIntakeResponseSchema, {
          method: 'POST',
          body: JSON.stringify({ message }),
          // A little above the API's own 15 s limit; a stalled request falls back to rules.
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        return null;
      }
    },
  });
}
