import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axeViolations, createFakeApi, renderRoute } from '../test/render';

beforeEach(() => {
  vi.stubGlobal('fetch', createFakeApi().fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('home page', () => {
  it('shows the continue card, tiles, standings, next project and shaky concepts', async () => {
    renderRoute('/');
    const title = await screen.findByRole('heading', { name: '5.2 Speculative Decoding' });
    const card = within(title.closest('section')!);
    expect(card.getByText('Chapter 5 · Techniques · Section 2 of 5')).toBeTruthy();
    expect(card.getByText(/38% through, with about 12 min to go/)).toBeTruthy();
    expect(card.getByRole('link', { name: /Resume reading/ }).getAttribute('href')).toBe(
      '/book/5.2',
    );
    expect(card.getByRole('link', { name: 'Skip to checkpoint' }).getAttribute('href')).toBe(
      '/checkpoint/5.2',
    );

    expect(screen.getByText('15 of 36 sections read')).toBeTruthy();
    expect(screen.getByText('83%', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('3h 40m')).toBeTruthy();
    expect(screen.getByText('goal 5h · on pace')).toBeTruthy();

    const table = within(screen.getByRole('table'));
    expect(table.getByRole('rowheader', { name: /Tofa\s*you/ })).toBeTruthy();
    expect(table.getByText('9d')).toBeTruthy();

    expect(screen.getByText(/unlocks after the 5\.5 checkpoint/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Review Arithmetic Intensity' })).toBeTruthy();
    expect(screen.getByText(/last checkpoint 50%/)).toBeTruthy();

    // The sidebar shows the real streak from /api/me.
    expect(screen.getByText('4 days')).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });
});

describe('progress page', () => {
  it('shows tiles, the heatmap, patterns, mastery and the recall queue', async () => {
    renderRoute('/progress');
    await screen.findByRole('heading', { name: 'Study days' });

    expect(screen.getByText('31.5h')).toBeTruthy();
    expect(screen.getByText('finish around 30 Jan 2027')).toBeTruthy();
    expect(screen.getByRole('img', { name: /study days? in the last 12 weeks/ })).toBeTruthy();
    expect(screen.getByText('Tuesday')).toBeTruthy();
    expect(screen.getByText('28 min')).toBeTruthy();
    expect(screen.getByText(/1\.8 vs 2\.1 sections a week/)).toBeTruthy();
    expect(screen.getByRole('meter', { name: 'You mastery' }).getAttribute('aria-valuenow')).toBe(
      '72',
    );
    expect(
      screen.getByRole('meter', { name: 'Friend mastery' }).getAttribute('aria-valuenow'),
    ).toBe('65');
    expect(screen.getByRole('button', { name: /Start recall/ })).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });
});
