import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerOption } from './AnswerOption';
import { ConfidencePills } from './ConfidencePills';
import { Input } from './Field';
import { ProgressBar, SegmentedProgress } from './ProgressBar';
import { Toggle } from './Toggle';

afterEach(cleanup);

describe('ProgressBar', () => {
  it('clamps the value and exposes it to assistive tech', () => {
    render(<ProgressBar label="Decode progress" value={140} />);
    const bar = screen.getByRole('progressbar', { name: 'Decode progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe('100%');
  });

  it('keeps an accessible name when the label row is hidden', () => {
    render(<ProgressBar label="Section" value={38} hideLabel />);
    expect(screen.getByRole('progressbar', { name: 'Section' })).toBeTruthy();
  });
});

describe('SegmentedProgress', () => {
  it('counts answered segments and names each one', () => {
    render(
      <SegmentedProgress label="Checkpoint" segments={['accepted', 'retry', 'current', 'empty']} />,
    );
    expect(screen.getByText('2 / 4')).toBeTruthy();
    expect(screen.getByText('Question 2: accepted on retry')).toBeTruthy();
  });
});

describe('ConfidencePills', () => {
  it('reports the chosen level', () => {
    const onChange = vi.fn();
    render(<ConfidencePills legend="How solid?" value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Solid' }));
    expect(onChange).toHaveBeenCalledWith('solid');
  });
});

describe('AnswerOption', () => {
  it('announces the graded state in words, not only colour', () => {
    render(<AnswerOption letter="C" label="Both equally" name="q" value="c" state="rejected" />);
    expect(
      screen.getByRole('radio', { name: 'Option C: Both equally (Not accepted, try again)' }),
    ).toBeTruthy();
  });
});

describe('Toggle', () => {
  it('flips aria-checked through onChange', () => {
    const onChange = vi.fn();
    render(<Toggle label="Hints" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Hints' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('Input', () => {
  it('links the label, hint and error', () => {
    render(<Input label="Repo URL" hint="Public repo" error="Enter a full URL" />);
    const input = screen.getByRole('textbox', { name: 'Repo URL' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')!.split(' ');
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toEqual([
      'Public repo',
      'Enter a full URL',
    ]);
  });
});
