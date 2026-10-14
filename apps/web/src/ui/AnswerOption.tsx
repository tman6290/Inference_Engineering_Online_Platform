import type { ChangeEvent } from 'react';
import { CheckIcon, RetryIcon } from './icons';
import styles from './AnswerOption.module.css';

export type AnswerState = 'idle' | 'accepted' | 'rejected';

interface AnswerOptionProps {
  /** A, B, C ... */
  letter: string;
  label: string;
  name: string;
  value: string;
  state?: AnswerState;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}

const stateWords: Record<Exclude<AnswerState, 'idle'>, string> = {
  accepted: 'Accepted',
  rejected: 'Not accepted, try again',
};

/** One multiple-choice option. A native radio; the grading state adds colour, an icon and words. */
export function AnswerOption({
  letter,
  label,
  name,
  value,
  state = 'idle',
  checked,
  defaultChecked,
  disabled,
  onChange,
}: AnswerOptionProps) {
  return (
    <label className={[styles.option, styles[state]].join(' ')}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange}
        className={styles.input}
      />
      <span className={styles.letter} aria-hidden="true">
        {letter}
      </span>
      <span className={styles.label}>
        <span className="visually-hidden">Option {letter}:</span> {label}
        {state !== 'idle' ? (
          <>
            {' '}
            <span className="visually-hidden">({stateWords[state]})</span>
          </>
        ) : null}
      </span>
      {state === 'accepted' ? <CheckIcon className={styles.mark} /> : null}
      {state === 'rejected' ? <RetryIcon className={styles.mark} /> : null}
    </label>
  );
}
