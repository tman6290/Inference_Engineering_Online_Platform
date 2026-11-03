import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations, createFakeApi, renderRoute } from '../../test/render';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function install(options: Parameters<typeof createFakeApi>[0] = {}) {
  const fake = createFakeApi(options);
  vi.stubGlobal('fetch', fake.fetch);
  return fake;
}

describe('duels on Home', () => {
  it('challenges from the pod table through a confirm sheet', async () => {
    const fake = install();
    renderRoute('/');
    const button = await screen.findByRole('button', { name: 'Challenge on 5.2' });
    button.focus();
    fireEvent.click(button);

    const sheet = screen.getByRole('dialog', {
      name: 'Challenge Friend on 5.2 Speculative Decoding?',
    });
    expect(
      within(sheet).getByText(/same ten fresh questions on this section, alone, within 48 hours/),
    ).toBeTruthy();
    expect(within(sheet).getByText(/loser records a 3-minute teach-back/)).toBeTruthy();
    expect(document.activeElement).toBe(
      within(sheet).getByRole('button', { name: 'Send the challenge' }),
    );
    expect(await axeViolations()).toEqual([]);

    // Escape cancels and hands focus back.
    fireEvent.keyDown(sheet, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Send the challenge' }));
    expect(await screen.findByRole('heading', { name: 'Challenge sent to Friend' })).toBeTruthy();
    expect(fake.pod.duels[0]).toMatchObject({ status: 'pending', section: { number: '5.2' } });
  }, 20_000);

  it('shows a running duel without the partner score', async () => {
    install();
    renderRoute('/');
    const card = within(
      (await screen.findByRole('heading', { name: 'Duels' })).closest('section')!,
    );
    expect(card.getByText("You scored 8/10. Friend's score shows once they finish.")).toBeTruthy();
    expect(card.queryByText(/to \d+\/10/)).toBeNull();
  });

  it('keeps an owed teach-back on Home until it is recorded', async () => {
    const fake = install({ owesTeachBack: true });
    const { router } = renderRoute('/');
    const link = await screen.findByRole('link', { name: 'Record your teach-back' });
    expect(screen.getByText('Friend won, 6/10 to 9/10. You owe a teach-back.')).toBeTruthy();
    fireEvent.click(link);

    await waitFor(() => expect(router.state.location.pathname).toBe('/duels/duel-lost/teach-back'));
    await screen.findByText('Which metric does speculation improve?');
    const boxes = screen.getAllByLabelText('Your explanation');
    expect(boxes).toHaveLength(2);
    fireEvent.change(boxes[0]!, { target: { value: 'Decode emits more tokens per pass.' } });
    fireEvent.change(boxes[1]!, { target: { value: 'One plus p plus p squared, and so on.' } });
    expect(await axeViolations()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save written teach-back' }));
    expect(await screen.findByText(/Recorded\. Friend can read it/)).toBeTruthy();
    expect(fake.pod.saved.entries?.map((entry) => entry.questionId)).toEqual(['5.2-q1', '5.2-q5']);

    void router.navigate('/');
    await screen.findByRole('heading', { name: '5.2 Speculative Decoding' });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Record your teach-back' })).toBeNull(),
    );
  });
});
