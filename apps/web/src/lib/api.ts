import { ErrorResponseSchema, HealthResponseSchema, type HealthResponse } from '@itsm/contracts';
import { useQuery } from '@tanstack/react-query';
import { refreshSession } from './auth';

let token: string | null = null;
export const setAccessToken = (value: string | null) => {
  token = value;
};
export const getAccessToken = () => token;
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function apiFetch<T>(
  path: string,
  schema: { parse: (data: unknown) => T },
  init: RequestInit = {},
  retried = false,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, credentials: 'include' });
  if (response.status === 401 && !retried && !path.startsWith('/api/auth/')) {
    if (await refreshSession()) return apiFetch(path, schema, init, true);
  }
  if (!response.ok) {
    const error = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(
      response.status,
      error.success ? error.data.error.code : 'UNKNOWN',
      error.success ? error.data.error.message : `Request failed (${response.status})`,
    );
  }
  if (response.status === 204) return undefined as T;
  return schema.parse(await response.json());
}
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
