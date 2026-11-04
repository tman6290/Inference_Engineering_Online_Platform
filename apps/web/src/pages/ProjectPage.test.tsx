import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axeViolations, createFakeApi, renderRoute } from '../test/render';

let fake: ReturnType<typeof createFakeApi>;

beforeEach(() => {
  fake = createFakeApi();
  vi.stubGlobal('fetch', fake.fetch);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const cardFor = (title: string) => within(screen.getByRole('link', { name: title }).closest('li')!);

describe('projects index', () => {
  it('shows seven cards with lock state, score and status', async () => {
    renderRoute('/projects');
    const list = await screen.findByRole('list', { name: 'Projects' });
    expect(within(list).getAllByRole('heading', { level: 2 })).toHaveLength(7);
    expect(screen.getByText('1 of 7 graded')).toBeTruthy();

    const first = cardFor('Latency budget audit');
    expect(first.getByText('Portfolio-ready')).toBeTruthy();
    expect(first.getByText('84')).toBeTruthy();
    expect(first.getByText('v2')).toBeTruthy();
    expect(first.getByText('Friend: v1, 71/100')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Latency budget audit' }).getAttribute('href')).toBe(
      '/projects/01-latency-budget-audit',
    );

    expect(cardFor('Roofline calculator').getByText('Grading')).toBeTruthy();
    const third = cardFor('Local inference fit');
    expect(third.getByText('Not submitted')).toBeTruthy();
    expect(third.getByText('Friend: v1, not graded yet')).toBeTruthy();

    const locked = cardFor('Speculation benchmark');
    expect(locked.getByText('Locked')).toBeTruthy();
    expect(locked.getByText('after the 5.5 checkpoint')).toBeTruthy();
    expect(locked.getByText('—')).toBeTruthy();

    expect(await axeViolations()).toEqual([]);
  });
});

describe('project page', () => {
  it('renders the brief, rubric, versions and a full critique', async () => {
    renderRoute('/projects/01-latency-budget-audit');
    await screen.findByRole('heading', { name: 'Latency budget audit', level: 1 });

    expect(screen.getByText('Solo')).toBeTruthy();
    expect(screen.getByText('v2 · graded')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Portfolio at 80+' }).hasAttribute('disabled')).toBe(
      false,
    );
    const tabs = within(screen.getByRole('navigation', { name: 'Project sections' }));
    expect(tabs.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '#brief',
      '#rubric',
      '#submission',
      '#critique',
    ]);
    expect(screen.getByRole('heading', { name: 'The task' })).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Rubric' })).getByText('Measurement'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: '1.4 Measuring Latency and Throughput' })).toBeTruthy();

    // The critique, every block.
    const critique = within(
      (
        await screen.findByRole('heading', {
          name: 'A clear budget, let down by one unbacked tail claim',
        })
      ).closest('section')!,
    );
    expect(critique.getByText('84')).toBeTruthy();
    expect(critique.getByText('34/40')).toBeTruthy();
    expect(critique.getByText('Warm-up excluded; 500 samples.')).toBeTruthy();
    expect(
      within(critique.getByRole('region', { name: 'What is right' })).getByText(/Separates time/),
    ).toBeTruthy();
    const wrong = within(critique.getByRole('region', { name: 'What is wrong' }));
    expect(wrong.getByText(/run check fails/)).toBeTruthy();
    expect(wrong.getByText('check: run')).toBeTruthy();
    const workOn = within(critique.getByRole('region', { name: 'Work on' }));
    expect(workOn.getByRole('link', { name: 'Read 1.4' }).getAttribute('href')).toBe('/book/1.4');
    const claims = within(critique.getByRole('region', { name: 'Unsupported claims' }));
    expect(claims.getByText(/P99 stays under 300 ms/)).toBeTruthy();
    expect(claims.getByText('results.json has no p99 field.')).toBeTruthy();
    const comments = within(critique.getByRole('region', { name: 'Inline comments' }));
    expect(comments.getByText('bench/measure.py:42')).toBeTruthy();
    expect(critique.getByText('Portfolio-ready')).toBeTruthy();
    expect(critique.getByText(/Graded by test-model for \$0\.0123/)).toBeTruthy();

    // Checks sit above the critique, failures included.
    expect(
      screen.getByText('make check finishes on CPU', { selector: 'summary span' }),
    ).toBeTruthy();
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);

    expect(await axeViolations()).toEqual([]);
  });

  it('shows only the partner’s version and score', async () => {
    renderRoute('/projects/01-latency-budget-audit');
    expect(
      await screen.findByText('Friend is on v1, scored 71. Their work stays private.'),
    ).toBeTruthy();
    const requested = fake.fetch.mock.calls.map(([input]) => String(input));
    expect(requested.filter((path) => path.startsWith('/api/submissions/'))).toEqual([
      '/api/submissions/sub-2',
    ]);
  });

  it('switches the critique to an older version', async () => {
    renderRoute('/projects/01-latency-budget-audit');
    const versions = await screen.findByRole('heading', { name: 'Your versions' });
    const older = within(versions.nextElementSibling as HTMLElement).getByRole('button', {
      name: /v1/,
    });
    fireEvent.click(older);
    expect(older.getAttribute('aria-pressed')).toBe('true');
    expect(await screen.findByText(/Version 1 · Graded/)).toBeTruthy();
  });

  it('submits a new version and shows it queued', async () => {
    renderRoute('/projects/03-local-inference-fit');
    await screen.findByRole('heading', { name: 'Local inference fit', level: 1 });
    expect(screen.getByText('Submit a version to see its checks and critique here.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('GitHub repository'), {
      target: { value: 'https://github.com/tofa/local-fit' },
    });
    fireEvent.change(screen.getByLabelText('Note to the grader (optional)'), {
      target: { value: 'First pass.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit for checks and critique' }));

    expect(await screen.findByText(/Version 1 · Waiting for the runner/)).toBeTruthy();
    expect(fake.projects.posted).toEqual([
      { repoUrl: 'https://github.com/tofa/local-fit', commitSha: '', noteToGrader: 'First pass.' },
    ]);
    expect(screen.getByText('v1 · queued')).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });

  it('keeps a locked project closed and says how to open it', async () => {
    renderRoute('/projects/05-speculation-benchmark');
    await screen.findByRole('heading', { name: 'Speculation benchmark', level: 1 });
    expect(screen.getByText('Locked')).toBeTruthy();
    expect(screen.queryByLabelText('GitHub repository')).toBeNull();
    expect(screen.getByRole('link', { name: '5.5 checkpoint' }).getAttribute('href')).toBe(
      '/checkpoint/5.5',
    );
    expect(screen.getByRole('button', { name: 'Portfolio at 80+' }).hasAttribute('disabled')).toBe(
      true,
    );
    await waitFor(async () => expect(await axeViolations()).toEqual([]));
  });

  it('says so when the project does not exist', async () => {
    renderRoute('/projects/09-nope');
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
