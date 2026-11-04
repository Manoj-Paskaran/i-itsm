import {
  AuthResponseSchema,
  LoginRequestSchema,
  type AuthResponse,
  type AuthUser,
} from '@itsm/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, setAccessToken } from './api';

type AuthState = {
  status: 'loading' | 'authenticated' | 'anonymous';
  user: AuthUser | null;
  token: string | null;
};
type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
let listener: ((data: AuthResponse | null) => void) | null = null;
let pending: Promise<AuthResponse | null> | null = null;
export function refreshSession() {
  if (!pending)
    pending = apiFetch('/api/auth/refresh', AuthResponseSchema, { method: 'POST' })
      .then((data) => {
        setAccessToken(data.accessToken);
        listener?.(data);
        return data;
      })
      .catch(() => {
        setAccessToken(null);
        listener?.(null);
        return null;
      })
      .finally(() => {
        pending = null;
      });
  return pending;
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, token: null });
  useEffect(() => {
    listener = (data) =>
      setState(
        data
          ? { status: 'authenticated', user: data.user, token: data.accessToken }
          : { status: 'anonymous', user: null, token: null },
      );
    void refreshSession();
    return () => {
      listener = null;
    };
  }, []);
  async function login(email: string, password: string) {
    const data = await apiFetch('/api/auth/login', AuthResponseSchema, {
      method: 'POST',
      body: JSON.stringify(LoginRequestSchema.parse({ email, password })),
    });
    setAccessToken(data.accessToken);
    setState({ status: 'authenticated', user: data.user, token: data.accessToken });
  }
  async function logout() {
    try {
      await apiFetch('/api/auth/logout', { parse: (value: unknown) => value }, { method: 'POST' });
    } finally {
      setAccessToken(null);
      queryClient.clear();
      setState({ status: 'anonymous', user: null, token: null });
    }
  }
  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  );
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('Missing AuthProvider');
  return value;
}
