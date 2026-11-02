import type { MeResponse } from '@forward-pass/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/auth';
import { buildRoutes } from '../routes';
import { ThemeProvider } from '../theme/theme';

export const TOFA: MeResponse = {
  user: { id: 'u1', email: 'tofa@example.com', displayName: 'Tofa', initial: 'T', colour: 'lime' },
  pod: [
    { id: 'u1', displayName: 'Tofa', initial: 'T', colour: 'lime' },
    { id: 'u2', displayName: 'Friend', initial: 'F', colour: 'butter' },
  ],
};

export const PASSWORD = 'correct horse battery';
export const INVITE = 'invite-one';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * A stand-in for the API with one session. Covers the routes the shell and auth pages call.
 * Install with vi.stubGlobal('fetch', fakeApi.fetch).
 */
export function createFakeApi({ signedIn = true }: { signedIn?: boolean } = {}) {
  const state = { signedIn };
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input.toString();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    switch (path) {
      case '/api/health':
        return json(200, { ok: true });
      case '/api/me':
        return state.signedIn ? json(200, TOFA) : json(401, { error: 'unauthenticated' });
      case '/api/auth/login':
        if (body?.password !== PASSWORD) {
          return json(401, {
            error: 'invalid_credentials',
            message: 'That email and password do not match.',
          });
        }
        state.signedIn = true;
        return json(200, TOFA);
      case '/api/auth/register':
        if (body?.inviteCode !== INVITE) {
          return json(400, { error: 'invalid_invite', message: 'That invite code is not valid.' });
        }
        state.signedIn = true;
        return json(201, { ...TOFA, pod: TOFA.pod.slice(0, 1) });
      case '/api/auth/logout':
        state.signedIn = false;
        return new Response(null, { status: 204 });
      default:
        return json(404, { error: 'not_found' });
    }
  });
  return { fetch, state };
}

export function renderRoute(path: string) {
  document.documentElement.lang = 'en';
  document.title = 'Forward Pass';
  const router = createMemoryRouter(buildRoutes({ devRoutes: true }), { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { ...view, router };
}

/** Runs axe over the whole document and returns readable violation summaries. */
export async function axeViolations(): Promise<string[]> {
  const results = await axe.run(document, { resultTypes: ['violations'] });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')})`,
  );
}
