import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { greeting } from '../pages/pages';
import { axeViolations, createFakeApi, INVITE, PASSWORD, renderRoute } from '../test/render';
import { safeNext } from './auth';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function signedOut() {
  const api = createFakeApi({ signedIn: false });
  vi.stubGlobal('fetch', api.fetch);
  return api;
}

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('auth flow', () => {
  it('sends a signed-out visitor to /login and back to where they were going', async () => {
    signedOut();
    const { router } = renderRoute('/book/5.2');

    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Fbook%2F5.2');

    fill('Email', 'tofa@example.com');
    fill('Password', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByRole('heading', { level: 1, name: 'Lesson' });
    expect(router.state.location.pathname).toBe('/book/5.2');
  });

  it('shows the server message for a wrong password and stays on /login', async () => {
    signedOut();
    const { router } = renderRoute('/login');
    await screen.findByRole('heading', { level: 1, name: 'Sign in' });

    fill('Email', 'tofa@example.com');
    fill('Password', 'wrong password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'That email and password do not match.',
    );
    expect(router.state.location.pathname).toBe('/login');
  });

  it('asks for an invite link when /register has no code', async () => {
    signedOut();
    renderRoute('/register');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'You need an invite link' }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('registers with the code from the link and lands on Home', async () => {
    const api = signedOut();
    const { router } = renderRoute(`/register?code=${INVITE}`);
    await screen.findByRole('heading', { level: 1, name: 'Claim your seat' });

    fill('Your name', 'Tofa');
    fill('Email', 'tofa@example.com');
    fill('Password', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const call = api.fetch.mock.calls.find(([path]) => path === '/api/auth/register');
    expect(JSON.parse(String(call![1]!.body))).toMatchObject({ inviteCode: INVITE });
  });

  it('explains a bad invite code in plain words', async () => {
    signedOut();
    renderRoute('/register?code=wrong');
    await screen.findByRole('heading', { level: 1, name: 'Claim your seat' });

    fill('Your name', 'Tofa');
    fill('Email', 'tofa@example.com');
    fill('Password', PASSWORD);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/invite link is not valid/);
  });

  it('signs out from the sidebar and returns to /login', async () => {
    const api = createFakeApi();
    vi.stubGlobal('fetch', api.fetch);
    const { router } = renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: /Tofa\.$/ });

    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' });
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Sign out' }));

    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(api.state.signedIn).toBe(false);
  });

  it('shows the real pod in the sidebar', async () => {
    vi.stubGlobal('fetch', createFakeApi().fetch);
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: /Tofa\.$/ });
    expect(screen.getByText('Tofa & Friend')).toBeTruthy();
  });

  it.each(['/login', '/register', '/register?code=x'])(
    'has no axe violations at %s',
    async (path) => {
      signedOut();
      renderRoute(path);
      await screen.findByRole('heading', { level: 1 });
      expect(await axeViolations()).toEqual([]);
    },
  );
});

describe('safeNext', () => {
  it.each([
    [null, '/'],
    ['/book/5.2', '/book/5.2'],
    ['/progress?tab=1', '/progress?tab=1'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/login', '/'],
    ['/register?code=x', '/'],
  ])('maps %s to %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe('greeting', () => {
  it('uses Lagos time (UTC+1)', () => {
    expect(greeting(new Date('2026-11-02T06:30:00Z'))).toBe('Good morning');
    expect(greeting(new Date('2026-11-02T11:30:00Z'))).toBe('Good afternoon');
    expect(greeting(new Date('2026-11-02T16:30:00Z'))).toBe('Good evening');
  });
});
