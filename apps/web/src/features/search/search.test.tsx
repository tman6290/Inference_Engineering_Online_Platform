import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axeViolations, createFakeApi, renderRoute } from '../../test/render';

beforeEach(() => {
  vi.stubGlobal('fetch', createFakeApi().fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pressShortcut = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

async function openAndType(text: string) {
  pressShortcut();
  const input = await screen.findByRole('combobox', { name: /Search the book/ });
  fireEvent.change(input, { target: { value: text } });
  await screen.findByText(/results?\. Use the arrow keys/);
  return input;
}

describe('search', () => {
  it('opens with Ctrl+K on any page, including lesson pages', async () => {
    for (const path of ['/', '/book/5.2', '/checkpoints']) {
      const view = renderRoute(path);
      await screen.findAllByRole('heading', { level: 1 });
      pressShortcut();
      expect(await screen.findByRole('dialog', { name: 'Search' })).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole('combobox'));
      view.unmount();
    }
  });

  it('groups results by type and moves through them with the arrow keys', async () => {
    const { router } = renderRoute('/');
    await screen.findByRole('heading', { level: 1 });
    const input = await openAndType('spec');

    const listbox = screen.getByRole('listbox', { name: 'Search results' });
    const groups = within(listbox).getAllByRole('group');
    expect(
      groups.map(
        (group) =>
          group.getAttribute('aria-labelledby') && within(group).getAllByRole('option').length,
      ),
    ).toEqual([1, 1]);
    expect(within(listbox).getByText('Sections')).toBeTruthy();
    expect(within(listbox).getByText('Glossary')).toBeTruthy();

    const options = within(listbox).getAllByRole('option');
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]!.id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/glossary'));
    expect(router.state.location.hash).toBe('#speculative-decoding');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('finds exercises and says when nothing matches', async () => {
    renderRoute('/progress');
    await screen.findByRole('heading', { level: 1 });
    await openAndType('toy speedup');
    expect(screen.getByRole('option', { name: /Work out a toy speedup/ })).toBeTruthy();

    // A misspelling still offers something to click, labelled as a close match.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'specualtive' } });
    expect(await screen.findByText(/Closest matches:/)).toBeTruthy();
    expect(screen.getByText(/No exact match\. 2 close matches/)).toBeTruthy();
    expect(screen.getByRole('option', { name: /5\.2 Speculative Decoding/ })).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } });
    expect(await screen.findByText('Nothing matches “zzz”.')).toBeTruthy();
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape and hands focus back to the trigger', async () => {
    renderRoute('/glossary');
    const trigger = await screen.findByRole('button', { name: /Search the book or glossary/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    expect(await axeViolations()).toEqual([]);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe('glossary page', () => {
  it('lists terms A to Z with where each is introduced and used', async () => {
    renderRoute('/glossary');
    const term = await screen.findByRole('article', { name: 'KV cache' });
    expect(
      within(term).getByRole('link', { name: '2.2 LLM Inference Mechanics' }).getAttribute('href'),
    ).toBe('/book/2.2');
    expect(
      within(term).getByRole('link', { name: 'Chapter 0 · Inference' }).getAttribute('href'),
    ).toBe('/book/0');
    expect(screen.getByRole('heading', { level: 2, name: '#' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'K' }).getAttribute('href')).toBe('#letter-K');

    fireEvent.change(screen.getByLabelText('Filter terms'), { target: { value: 'drafter' } });
    expect(screen.getByText('1 of 3 terms match.')).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'KV cache' })).toBeNull();
    expect(await axeViolations()).toEqual([]);
  });
});
