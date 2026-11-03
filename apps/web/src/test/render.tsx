import type { LessonResponse, MeResponse } from '@forward-pass/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/auth';
import { buildRoutes } from '../routes';
import { ThemeProvider } from '../theme/theme';
import { createFakeCheckpoint } from './fake-checkpoint';
import { book, lesson21, lesson52 } from './lesson-fixtures';

export const TOFA: MeResponse = {
  user: {
    id: 'u1',
    email: 'tofa@example.com',
    displayName: 'Tofa',
    initial: 'T',
    colour: 'lime',
    mustChangePassword: false,
  },
  pod: [
    { id: 'u1', displayName: 'Tofa', initial: 'T', colour: 'lime' },
    { id: 'u2', displayName: 'Friend', initial: 'F', colour: 'butter' },
  ],
  stats: { answered: 0, acceptedFirstTry: 0, acceptanceRate: null },
};

export const PASSWORD = 'correct horse battery';
export const INVITE = 'invite-one';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/**
 * A stand-in for the API with one session. Covers the routes the shell, auth, book and lesson
 * pages call; lessons 5.2 (with a digest) and 2.1 (without) exist.
 * Install with vi.stubGlobal('fetch', fakeApi.fetch).
 */
export function createFakeApi({
  signedIn = true,
  mustChangePassword = false,
}: { signedIn?: boolean; mustChangePassword?: boolean } = {}) {
  const state = {
    signedIn,
    mustChangePassword,
    password: PASSWORD,
    lessons: structuredClone({ '5.2': lesson52, '2.1': lesson21 }) as Record<
      string,
      LessonResponse
    >,
  };
  const checkpoint = createFakeCheckpoint();
  const me = (): MeResponse => ({
    ...TOFA,
    user: { ...TOFA.user, mustChangePassword: state.mustChangePassword },
  });
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input.toString();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;

    switch (path) {
      case '/api/health':
        return json(200, { ok: true });
      case '/api/me':
        return state.signedIn ? json(200, me()) : json(401, { error: 'unauthenticated' });
      case '/api/auth/login':
        if (body?.password !== state.password) {
          return json(401, {
            error: 'invalid_credentials',
            message: 'That email and password do not match.',
          });
        }
        state.signedIn = true;
        return json(200, me());
      case '/api/auth/register':
        if (body?.inviteCode !== INVITE) {
          return json(400, { error: 'invalid_invite', message: 'That invite code is not valid.' });
        }
        state.signedIn = true;
        return json(201, { ...TOFA, pod: TOFA.pod.slice(0, 1) });
      case '/api/auth/password':
        if (!state.signedIn) return json(401, { error: 'unauthenticated' });
        if (body?.currentPassword !== state.password) {
          return json(400, {
            error: 'wrong_password',
            message: 'Your current password is not right.',
          });
        }
        state.password = body.newPassword;
        state.mustChangePassword = false;
        return json(200, me());
      case '/api/auth/logout':
        state.signedIn = false;
        return new Response(null, { status: 204 });
      case '/api/book':
        return json(200, book);
    }

    const handled = checkpoint.handle(path, init?.method ?? 'GET', body);
    if (handled) return handled;

    const lesson = /^\/api\/(?:lessons|sections)\/([^/]+)(?:\/(\w+))?$/.exec(path);
    const current = lesson ? state.lessons[decodeURIComponent(lesson[1]!)] : undefined;
    if (!lesson || !current) return json(404, { error: 'not_found' });
    switch (lesson[2]) {
      case undefined:
        return json(200, current);
      case 'reading':
        return json(200, current.progress);
      case 'confidence':
        current.progress = { ...current.progress, readState: 'read', confidence: body.level };
        return json(200, current.progress);
      case 'note':
        current.note = { body: body.body, updatedAt: new Date().toISOString() };
        return json(200, current.note);
      case 'check': {
        const accepted = body.kind === 'scenario_mc' && body.choice === 0;
        current.check = {
          accepted,
          attempts: (current.check?.attempts ?? 0) + 1,
          feedback: accepted
            ? 'Right: each pass emits more tokens.'
            : 'Think about which phase it speeds up.',
          explanation: accepted ? 'Speculation changes the decode loop.' : null,
          choice: body.kind === 'scenario_mc' ? body.choice : null,
        };
        return json(200, current.check);
      }
      default:
        return json(404, { error: 'not_found' });
    }
  });
  return { fetch, state, checkpoint };
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
