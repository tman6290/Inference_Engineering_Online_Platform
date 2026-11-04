import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axeViolations, createFakeApi, renderRoute } from '../test/render';

let fake: ReturnType<typeof createFakeApi>;

function start(options: Parameters<typeof createFakeApi>[0] = {}) {
  fake = createFakeApi(options);
  vi.stubGlobal('fetch', fake.fetch);
}

/** The page live, with v2 of project 01 public. */
function publish() {
  fake.projects.settings.username = 'tofa';
  fake.projects.settings.pageLive = true;
  fake.projects.submissions['01-latency-budget-audit']![0]!.public = true;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const portfolioCard = async () =>
  within((await screen.findByRole('heading', { name: 'Portfolio' })).closest('section')!);

describe('portfolio on the Progress page', () => {
  it('starts private, needs a username to go live, then publishes a case study', async () => {
    start();
    renderRoute('/progress');
    const card = await portfolioCard();
    expect(await card.findByText(/1 of 7 projects shipped/)).toBeTruthy();
    const live = card.getByRole('switch', { name: 'Page is live' });
    expect(live.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(live);
    expect((await card.findByRole('alert')).textContent).toBe(
      'Pick a username before putting the page live.',
    );

    fireEvent.change(card.getByLabelText('Username'), { target: { value: 'Tofa' } });
    fireEvent.click(card.getByRole('switch', { name: 'Page is live' }));
    expect(await card.findByRole('link', { name: '/p/tofa' })).toBeTruthy();
    expect(card.getByRole('switch', { name: 'Page is live' }).getAttribute('aria-checked')).toBe(
      'true',
    );

    const toggle = card.getByRole('switch', { name: 'Public case study: Latency budget audit' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(await card.findByText('This version is public.')).toBeTruthy();
    expect(card.getByRole('link', { name: 'View case study' }).getAttribute('href')).toBe(
      '/p/tofa/01-latency-budget-audit',
    );
    expect(card.getByRole('link', { name: 'Download PDF' }).getAttribute('href')).toBe(
      '/api/submissions/sub-2/case-study.pdf',
    );
    expect(await axeViolations()).toEqual([]);
  });

  it('reports a taken username', async () => {
    start();
    renderRoute('/progress');
    const card = await portfolioCard();
    fireEvent.change(await card.findByLabelText('Username'), { target: { value: 'friend' } });
    fireEvent.click(card.getByRole('button', { name: 'Save' }));
    expect((await card.findByRole('alert')).textContent).toBe('That username is taken.');
  });
});

describe('project page portfolio actions', () => {
  it('adds the ready version to the portfolio and shares it once the page is live', async () => {
    start();
    renderRoute('/projects/01-latency-budget-audit');
    const share = await screen.findByRole('button', { name: 'Share link' });
    expect(share.hasAttribute('disabled')).toBe(true);
    expect(
      (await screen.findByRole('link', { name: 'Download the case study as a PDF' })).getAttribute(
        'href',
      ),
    ).toBe('/api/submissions/sub-2/case-study.pdf');

    fake.projects.settings.username = 'tofa';
    fake.projects.settings.pageLive = true;
    fireEvent.click(await screen.findByRole('button', { name: 'Add v2 to portfolio' }));
    expect(await screen.findByRole('button', { name: 'Remove v2 from portfolio' })).toBeTruthy();
    expect((await screen.findByRole('link', { name: 'Share link' })).getAttribute('href')).toBe(
      '/p/tofa/01-latency-budget-audit',
    );
  });
});

describe('public pages', () => {
  it('answer "no public page" while the page is off, signed out', async () => {
    start({ signedIn: false });
    renderRoute('/p/tofa');
    expect(await screen.findByRole('heading', { name: 'No public page here' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull();
  });

  it('show the profile while the page is live, signed out', async () => {
    start({ signedIn: false });
    publish();
    renderRoute('/p/tofa');
    expect(await screen.findByRole('heading', { name: 'Tofa', level: 1 })).toBeTruthy();
    expect(screen.getByText('83%')).toBeTruthy();
    expect(screen.getByText('latency percentiles')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Latency budget audit' }).getAttribute('href')).toBe(
      '/p/tofa/01-latency-budget-audit',
    );
    expect(screen.getByText('Budget 180 ms for TTFT and spend the rest on decode.')).toBeTruthy();
    expect(await axeViolations()).toEqual([]);
  });

  it('render a case study with nothing private on it', async () => {
    start({ signedIn: false });
    publish();
    renderRoute('/p/tofa/01-latency-budget-audit');
    expect(
      await screen.findByRole('heading', { name: 'Latency budget audit', level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText('84')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Measurement' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Chart: latency.png' }).getAttribute('src')).toBe(
      '/api/public/tofa/01-latency-budget-audit/charts/latency.png',
    );
    expect(screen.getByText(/Separates time to first token/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Repository on GitHub' })).toBeTruthy();

    const text = document.body.textContent ?? '';
    for (const secret of ['run check fails', 'bench/measure.py', '500 samples', 'P99 stays']) {
      expect(text).not.toContain(secret);
    }
    expect(await axeViolations()).toEqual([]);
  });
});
