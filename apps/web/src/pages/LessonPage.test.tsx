import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axeViolations, createFakeApi, renderRoute } from '../test/render';

let fakeApi: ReturnType<typeof createFakeApi>;

beforeEach(() => {
  fakeApi = createFakeApi();
  vi.stubGlobal('fetch', fakeApi.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function calls(method: string, path: string) {
  return fakeApi.fetch.mock.calls.filter(
    ([input, init]) => String(input) === path && (init?.method ?? 'GET') === method,
  );
}

describe('lesson page', () => {
  it('renders the authored digest for a section', async () => {
    renderRoute('/book/5.2');
    await screen.findByRole('heading', { level: 1, name: 'Speculative Decoding' });

    expect(screen.getByText(/A cheap drafter guesses several tokens/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Key ideas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Tokens per pass at draft length 4' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Check yourself' })).toBeTruthy();
    expect(screen.getByText('Why does a very long draft usually backfire?')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Figure 5\.3/ })).toBeTruthy();
    // The key never reaches the browser, so the model answer text is the only reveal.
    expect(screen.queryByText(/Speculation changes the decode loop/)).toBeNull();
  });

  it('grades the check question and shows the explanation once accepted', async () => {
    renderRoute('/book/5.2');
    await screen.findByRole('heading', { level: 1, name: 'Speculative Decoding' });

    fireEvent.click(screen.getByRole('button', { name: 'Time to first token' }));
    expect(await screen.findByText(/Not yet. Think about which phase it speeds up./)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Decode tokens per second' }));
    expect(await screen.findByText('Speculation changes the decode loop.')).toBeTruthy();
    expect(calls('POST', '/api/lessons/5.2/check')).toHaveLength(2);
  });

  it('saves a confidence rating', async () => {
    renderRoute('/book/5.2');
    await screen.findByRole('heading', { level: 1, name: 'Speculative Decoding' });

    const group = screen.getByRole('group', { name: /How solid is Speculative Decoding/ });
    fireEvent.click(within(group).getByRole('radio', { name: 'Solid' }));
    await waitFor(() => expect(calls('PUT', '/api/sections/5.2/confidence')).toHaveLength(1));
    expect(fakeApi.state.lessons['5.2']!.progress.confidence).toBe('solid');
  });

  it('falls back to the book text when a section has no digest', async () => {
    renderRoute('/book/2.1');
    await screen.findByRole('heading', { level: 1, name: 'Neural Networks' });

    expect(screen.getByText('Toy intro for the fallback view.')).toBeTruthy();
    expect(screen.getByText('A toy paragraph about matmul.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Check yourself' })).toBeNull();
  });

  it.each(['/book/5.2', '/book/2.1'])('has no axe violations at %s', async (path) => {
    renderRoute(path);
    await screen.findByRole('heading', { level: 1, name: /Speculative Decoding|Neural Networks/ });
    expect(await axeViolations()).toEqual([]);
  });
});

describe('book page', () => {
  it('lists chapters and sections with their read state', async () => {
    renderRoute('/book');
    await screen.findByRole('heading', { level: 2, name: 'Chapter 5 · Techniques' });

    const link = screen.getByRole('link', { name: /5\.2 Speculative Decoding/ });
    expect(link.getAttribute('href')).toBe('/book/5.2');
    expect(link.textContent).toContain('In progress · Shaky · 4 min');
    expect(screen.getByText(/0 of 36 sections decoded/)).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });
});
