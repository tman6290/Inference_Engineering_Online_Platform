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

function currentCard() {
  const heading = screen.getByRole('heading', { level: 2, name: /^Toy / });
  return within(heading.closest('section')!);
}

/** Answers whatever question is showing, right or wrong. */
function answerCurrent(right: boolean) {
  const card = currentCard();
  const prompt = card.getByRole('heading', { level: 2 }).textContent!;
  if (prompt.startsWith('Toy scenario')) {
    fireEvent.click(card.getByRole('radio', { name: right ? /Right lever/ : /Wrong lever a/ }));
  } else if (prompt.startsWith('Toy sum')) {
    fireEvent.change(card.getByLabelText('Your answer'), { target: { value: right ? '10' : '3' } });
  } else {
    fireEvent.change(card.getByLabelText('Your answer'), {
      target: { value: right ? 'KV cache' : 'weights' },
    });
  }
  fireEvent.click(card.getByRole('button', { name: 'Submit answer' }));
}

async function startAttempt() {
  renderRoute('/checkpoint/5.2');
  fireEvent.click(await screen.findByRole('button', { name: /Start the checkpoint/ }));
  await screen.findByRole('heading', { level: 2, name: /^Toy / });
}

describe('checkpoint page', () => {
  it('runs a full ten-question attempt to a pass', async () => {
    await startAttempt();
    expect(screen.getByText('Question 1 of 10 · Scenario · 5.2.1')).toBeTruthy();
    // The answer format shows before answering.
    expect(currentCard().getByText('one option')).toBeTruthy();

    // A miss on question 1 first, then right on retry.
    answerCurrent(false);
    expect(await screen.findByText(/Not within reach/)).toBeTruthy();
    answerCurrent(true);
    expect(await screen.findByText('Accepted on try 2.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Re-read 5.2.1' }).getAttribute('href')).toBe(
      '/book/5.2',
    );

    for (let n = 2; n <= 10; n++) {
      fireEvent.click(screen.getByRole('button', { name: /Next question/ }));
      await screen.findByText(`Question ${n} of 10`, { exact: false });
      answerCurrent(true);
      await screen.findByText('Accepted on the first try.');
    }

    expect(
      await screen.findByRole('heading', { name: '9 of 10 accepted on the first try' }),
    ).toBeTruthy();
    expect(screen.getByText('Passed', { selector: 'span, p' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Continue to Disaggregation/ })).toBeTruthy();
    expect(fakeApi.checkpoint.finished[0]!.attempt.passed).toBe(true);
  }, 20_000);

  it('logs a hint when the learner opens it', async () => {
    await startAttempt();
    const card = currentCard();
    const summary = card.getByText('Hint');
    fireEvent.click(summary);
    const details = summary.closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));

    expect(await screen.findByText(/Think about the toy lever for 5\.2-q1/)).toBeTruthy();
    expect(fakeApi.checkpoint.current()!.questions[0]!.usedHint).toBe(true);
  });

  it('ends an attempt early after confirming', async () => {
    await startAttempt();
    answerCurrent(true);
    await screen.findByText('Accepted on the first try.');
    fireEvent.click(screen.getByRole('button', { name: 'End attempt now' }));
    fireEvent.click(screen.getByRole('button', { name: 'End attempt' }));
    expect(
      await screen.findByRole('heading', { name: '1 of 10 accepted on the first try' }),
    ).toBeTruthy();
    expect(screen.getByText('Not passed yet')).toBeTruthy();
  });

  it('jumps between questions from the map', async () => {
    await startAttempt();
    const map = screen.getByRole('list', { name: 'Question map' });
    fireEvent.click(within(map).getByRole('button', { name: 'Question 6, not answered' }));
    expect(await screen.findByText(/Question 6 of 10 · Calculation/)).toBeTruthy();
    expect(screen.getByText(/Accepted within ±5% of the answer/)).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe('Toy sum 6: how much memory?'),
    );
  });

  it('has no axe violations on the start screen, mid-attempt and on the result', async () => {
    renderRoute('/checkpoint/5.2');
    await screen.findByRole('button', { name: /Start the checkpoint/ });
    expect(await axeViolations()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /Start the checkpoint/ }));
    await screen.findByRole('heading', { level: 2, name: /^Toy / });
    answerCurrent(false);
    await screen.findByText(/Not within reach/);
    expect(await axeViolations()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'End attempt now' }));
    fireEvent.click(screen.getByRole('button', { name: 'End attempt' }));
    await screen.findByRole('heading', { name: /accepted on the first try/ });
    expect(await axeViolations()).toEqual([]);
  });
});

describe('checkpoints page', () => {
  it('lists sections, history and the recall queue', async () => {
    renderRoute('/checkpoints');
    const link = await screen.findByRole('link', { name: /5\.2 Speculative Decoding/ });
    expect(link.getAttribute('href')).toBe('/checkpoint/5.2');
    expect(screen.getByText('Not taken')).toBeTruthy();
    expect(screen.getByRole('link', { name: '1.1 Cost' })).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });
});

describe('exercise page', () => {
  const path = '/book/5.2/exercises/5.2-toy-speedup';

  it('shows the brief, files and test command, then grades the answer', async () => {
    renderRoute(path);
    await screen.findByRole('heading', { level: 1, name: 'Work out a toy speedup' });
    expect(screen.getByRole('link', { name: 'speedup.py' }).getAttribute('href')).toBe(
      '/api/exercises/5.2-toy-speedup/files/speedup.py',
    );
    expect(screen.getByText('python -m pytest -q')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Solution walkthrough' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
    expect(await screen.findByText(/Not within tolerance/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Your answer'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check my answer' }));
    expect(await screen.findByRole('heading', { name: 'Solution walkthrough' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'solution/speedup.py' })).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });

  it('reveals the solution on request and marks it revealed', async () => {
    renderRoute(path);
    fireEvent.click(await screen.findByRole('button', { name: 'Stuck? See the solution' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show the solution' }));
    expect(await screen.findByRole('heading', { name: 'Solution walkthrough' })).toBeTruthy();
    expect(screen.getByText('Revealed')).toBeTruthy();
    expect(fakeApi.checkpoint.exercise().revealed).toBe(true);
  });

  it('is listed on its lesson', async () => {
    renderRoute('/book/5.2');
    const link = await screen.findByRole('link', { name: /Work out a toy speedup/ });
    expect(link.getAttribute('href')).toBe('/book/5.2/exercises/5.2-toy-speedup');
  });
});
