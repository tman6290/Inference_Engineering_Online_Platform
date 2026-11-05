import {
  meResponseSchema,
  type ChangePasswordRequest,
  type LoginRequest,
  type MeResponse,
  type RegisterRequest,
} from '@forward-pass/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, ApiRequestError, retryDelay, retryTransient } from '../api/client';

const ME_KEY = ['me'] as const;

/** null means "not signed in". */
async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await api('/api/me', { schema: meResponseSchema });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

interface AuthContextValue {
  me: MeResponse | null;
  status: 'loading' | 'ready' | 'error';
  /** Still loading after a failed try: the API host is probably waking up. */
  waking: boolean;
  login: (input: LoginRequest) => Promise<void>;
  register: (input: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  /** Keeps this session signed in; the server signs out any others. */
  changePassword: (input: ChangePasswordRequest) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: retryTransient,
    retryDelay,
  });

  const value: AuthContextValue = {
    me: query.data ?? null,
    // A failed background check (say, back on the tab while the API host wakes) keeps the session
    // we already have; only a first load with no answer at all is an error.
    status: query.isPending ? 'loading' : query.data === undefined ? 'error' : 'ready',
    waking: query.isPending && query.failureCount > 0,
    async login(input) {
      const me = await api('/api/auth/login', {
        method: 'POST',
        body: input,
        schema: meResponseSchema,
      });
      queryClient.setQueryData(ME_KEY, me);
    },
    async register(input) {
      const me = await api('/api/auth/register', {
        method: 'POST',
        body: input,
        schema: meResponseSchema,
      });
      queryClient.setQueryData(ME_KEY, me);
    },
    async changePassword(input) {
      const me = await api('/api/auth/password', {
        method: 'POST',
        body: input,
        schema: meResponseSchema,
      });
      queryClient.setQueryData(ME_KEY, me);
    },
    async logout() {
      await api('/api/auth/logout', { method: 'POST' });
      // Mark the session as gone (RequireAuth then redirects), and drop this user's other data.
      queryClient.setQueryData(ME_KEY, null);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** Only same-site paths, never back to the auth pages, never protocol-relative URLs. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  if (['/login', '/register', '/change-password'].some((page) => next.startsWith(page))) return '/';
  return next;
}
