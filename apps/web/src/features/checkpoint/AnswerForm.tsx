import type { AnswerInput, Tolerance } from '@forward-pass/shared';
import { useState, type FormEvent } from 'react';
import { AnswerOption, Button, Input } from '../../ui';
import styles from './AnswerForm.module.css';

/** What the form needs to know about the question. Built from a public question or exercise. */
export type AnswerShape =
  | { kind: 'scenario_mc'; options: string[] }
  | { kind: 'calculation'; unit: string; units: string[]; tolerance?: Tolerance }
  | { kind: 'text' };

interface AnswerFormProps {
  shape: AnswerShape;
  /** Shown above the input, e.g. "number, in GB" or "*****". */
  answerFormat: string;
  /** Unique per question, so radio groups and inputs don't collide. */
  name: string;
  /** Closed questions show the learner's last answer and the key, read-only. */
  closed: boolean;
  pending: boolean;
  lastAnswer: AnswerInput | null;
  lastAccepted: boolean | null;
  solution: AnswerInput | null;
  onSubmit: (answer: AnswerInput) => void;
  submitLabel?: string;
}

const LETTERS = 'ABCDEFGH';

export function toleranceNote(tolerance: Tolerance, unit: string): string {
  return tolerance.kind === 'relative'
    ? `Accepted within ±${Number((tolerance.value * 100).toPrecision(3))}% of the answer.`
    : `Accepted within ±${tolerance.value} ${unit} of the answer.`;
}

/** The input for one question: options, a number with its unit, or a short text answer. */
export function AnswerForm({
  shape,
  answerFormat,
  name,
  closed,
  pending,
  lastAnswer,
  lastAccepted,
  solution,
  onSubmit,
  submitLabel = 'Submit answer',
}: AnswerFormProps) {
  const lastChoice = lastAnswer?.kind === 'scenario_mc' ? lastAnswer.choice : null;
  const [choice, setChoice] = useState<number | null>(closed ? lastChoice : null);
  const [error, setError] = useState<string | null>(null);
  const formatId = `${name}-format`;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    if (shape.kind === 'scenario_mc') {
      if (choice === null) return setError('Pick one of the options.');
      onSubmit({ kind: 'scenario_mc', choice });
    } else if (shape.kind === 'calculation') {
      const raw = String(data.get('value') ?? '')
        .replace(/,/g, '')
        .trim();
      const value = Number(raw);
      if (!raw || !Number.isFinite(value)) return setError('Enter a number.');
      onSubmit({ kind: 'calculation', value, unit: String(data.get('unit') ?? shape.unit) });
    } else {
      const text = String(data.get('text') ?? '').trim();
      if (!text) return setError('Enter an answer.');
      onSubmit({ kind: 'text', text });
    }
  };

  const solutionChoice = solution?.kind === 'scenario_mc' ? solution.choice : null;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.format} id={formatId}>
        <span className={styles.formatLabel}>Answer format</span> {answerFormat}
      </p>

      {shape.kind === 'scenario_mc' ? (
        <fieldset className={styles.options} aria-describedby={formatId}>
          <legend className="visually-hidden">Options</legend>
          {shape.options.map((option, index) => {
            // Closed: the key in green, a wrong last pick in amber. Open: the miss stays marked
            // until the learner picks something else.
            const missed = index === lastChoice && lastAccepted === false;
            const state =
              closed && index === solutionChoice
                ? 'accepted'
                : missed && (closed || choice === index)
                  ? 'rejected'
                  : 'idle';
            return (
              <AnswerOption
                key={option}
                letter={LETTERS[index]!}
                label={option}
                name={name}
                value={String(index)}
                state={state}
                checked={choice === index}
                disabled={closed || pending}
                onChange={() => setChoice(index)}
              />
            );
          })}
        </fieldset>
      ) : shape.kind === 'calculation' ? (
        <div className={styles.row}>
          <Input
            label="Your answer"
            name="value"
            inputMode="decimal"
            autoComplete="off"
            className={styles.number}
            defaultValue={lastAnswer?.kind === 'calculation' ? String(lastAnswer.value) : undefined}
            disabled={closed}
            hint={shape.tolerance ? toleranceNote(shape.tolerance, shape.unit) : undefined}
          />
          {shape.units.length > 1 ? (
            <label className={styles.unit}>
              <span>Unit</span>
              <select
                name="unit"
                defaultValue={
                  lastAnswer?.kind === 'calculation' && lastAnswer.unit
                    ? lastAnswer.unit
                    : shape.unit
                }
                disabled={closed}
              >
                {shape.units.map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </label>
          ) : (
            <p className={styles.unitFixed}>{shape.unit}</p>
          )}
        </div>
      ) : (
        <Input
          label="Your answer"
          name="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={/^[*\s-]+$/.test(answerFormat) ? answerFormat : undefined}
          defaultValue={lastAnswer?.kind === 'text' ? lastAnswer.text : undefined}
          disabled={closed}
        />
      )}

      {closed && solution && solution.kind !== 'scenario_mc' ? (
        <p className={styles.key}>
          <span className={styles.formatLabel}>Answer key</span>{' '}
          {solution.kind === 'calculation'
            ? `${solution.value} ${solution.unit ?? ''}`
            : solution.text}
        </p>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {closed ? null : (
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Checking…' : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
