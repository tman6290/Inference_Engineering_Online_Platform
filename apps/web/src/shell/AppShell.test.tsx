import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axeViolations, renderRoute } from '../test/render';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

describe('app shell', () => {
  it('renders the full sidebar with every section on Home', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: 'Good morning.' });

    const nav = within(mainNav());
    for (const label of ['Home', 'The Book', 'Checkpoints', 'Projects', 'Progress', 'Glossary']) {
      expect(nav.getByRole('link', { name: label })).toBeTruthy();
    }
    expect(nav.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { name: 'Study pod' })).toBeTruthy();
    expect(screen.getByText('uptime streak')).toBeTruthy();
  });

  it('collapses to the icon rail on a lesson route and keeps link names', async () => {
    renderRoute('/book/5.2');
    await screen.findByRole('heading', { level: 1, name: 'Lesson' });

    expect(document.querySelector('[data-rail="true"]')).not.toBeNull();
    const book = within(mainNav()).getByRole('link', { name: 'The Book' });
    expect(book.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('heading', { name: 'Study pod' })).toBeNull();
    expect(screen.getByText('Signed in as Tofa')).toBeTruthy();
  });

  it('marks Checkpoints active on a checkpoint route', async () => {
    renderRoute('/checkpoint/5.2');
    await screen.findByRole('heading', { level: 1, name: 'Checkpoint' });
    expect(document.querySelector('[data-rail="true"]')).not.toBeNull();
    const link = within(mainNav()).getByRole('link', { name: 'Checkpoints' });
    expect(link.getAttribute('aria-current')).toBe('page');
  });

  it('opens and closes the small-screen menu', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: 'Good morning.' });
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Main menu' })).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes the small-screen menu after following a link', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: 'Good morning.' });
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);
    const menu = within(screen.getByRole('navigation', { name: 'Main menu' }));
    fireEvent.click(menu.getByRole('link', { name: 'Glossary' }));

    await screen.findByRole('heading', { level: 1, name: 'Glossary' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('navigation', { name: 'Main menu' })).toBeNull();
  });

  it('switches to the dark reading theme and remembers it', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1, name: 'Good morning.' });
    const [toggle] = screen.getAllByRole('button', { name: 'Dark reading mode' });
    fireEvent.click(toggle!);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('forward-pass:theme')).toBe('dark');
  });

  it.each([
    '/',
    '/book',
    '/book/5.2',
    '/checkpoints',
    '/checkpoint/5.2',
    '/projects',
    '/projects/05-speculation-benchmark',
    '/progress',
    '/glossary',
    '/login',
    '/nowhere',
  ])('has no axe violations at %s', async (path) => {
    renderRoute(path);
    await screen.findByRole('heading', { level: 1 });
    expect(await axeViolations()).toEqual([]);
  });

  it('has no axe violations with the small-screen menu open', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(await axeViolations()).toEqual([]);
  });

  it('has no axe violations in the dark theme', async () => {
    renderRoute('/');
    await screen.findByRole('heading', { level: 1 });
    fireEvent.click(screen.getAllByRole('button', { name: 'Dark reading mode' })[0]!);
    expect(await axeViolations()).toEqual([]);
  });
});

describe('/dev/ui', () => {
  it('renders every primitive with no axe violations', async () => {
    renderRoute('/dev/ui');
    await screen.findByRole('heading', { level: 1, name: 'UI primitives' }, { timeout: 5000 });
    for (const name of [
      'Button',
      'Chip',
      'ProgressBar',
      'StatTile',
      'Card',
      'Eyebrow',
      'ConfidencePills',
      'AnswerOption',
      'Input and Textarea',
      'Toggle',
      'Icons',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    }
    expect(await axeViolations()).toEqual([]);
  });
});
