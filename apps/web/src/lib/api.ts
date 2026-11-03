import { HealthResponseSchema, type HealthResponse } from '@itsm/contracts';
import { useQuery } from '@tanstack/react-query';

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/health');
  if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
  return HealthResponseSchema.parse(await response.json());
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 10_000,
    retry: false,
  });
}
