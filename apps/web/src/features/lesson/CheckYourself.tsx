import type { AnswerInput, CheckResult, PublicQuestion } from '@forward-pass/shared';
import { useId, useState, type FormEvent } from 'react';
import { ApiRequestError } from '../../api/client';
import { Button, Eyebrow, Input } from '../../ui';
import { useCheckAnswer } from './api';
import styles from './CheckYourself.module.css';

interface CheckYourselfProps {
  lessonId: string;
  question: PublicQuestion;
  /** The learner's earlier result, restored on reload. */
  initial: CheckResult | null;
}

/** The lesson's inline question, graded on the server against its key. */
export function CheckYourself({ lessonId, question, initial }: CheckYourselfProps) {
  const check = useCheckAnswer(lessonId);
  const [result, setResult] = useState<CheckResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<number | null>(initial?.choice ?? null);
  // Once answered correctly the question locks; later page loads restore that.
  const [accepted, setAccepted] = useState(initial?.accepted ?? false);
  const resultId = useId();

  const submit = async (answer: AnswerInput) => {
    setError(null);
    try {
      const next = await check.mutateAsync(answer);
      setResult(next);
      if (next.accepted) setAccepted(true);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not reach the server. Try again.',
      );
    }
  };

  const onForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (question.kind === 'calculation') {
      void submit({
        kind: 'calculation',
        value: Number(String(data.get('value')).replace(/,/g, '')),
        unit: String(data.get('unit') ?? question.unit),
      });
    } else if (question.kind === 'text') {
      void submit({ kind: 'text', text: String(data.get('text') ?? '') });
    }
  };

  return (
    <section className={styles.check} aria-labelledby="check-yourself" id="check-yourself">
      <div className={styles.head}>
        <Eyebrow as="h2" tone="accent" id="check-yourself">
          Check yourself
        </Eyebrow>
        <span className={styles.note}>counts toward your acceptance rate</span>
      </div>
      <p className={styles.prompt}>{question.prompt}</p>
      <p className={styles.format}>
        <span className="visually-hidden">Answer format: </span>
        {question.answerFormat}
      </p>

      {question.kind === 'scenario_mc' ? (
        <div
          className={styles.options}
          role="group"
          aria-label="Options"
          aria-describedby={result ? resultId : undefined}
        >
          {question.options.map((option, index) => {
            const picked = choice === index;
            const state = picked && result ? (result.accepted ? 'right' : 'wrong') : 'idle';
            return (
              <button
                key={option}
                type="button"
                className={[styles.option, styles[state]].join(' ')}
                aria-pressed={picked}
                disabled={accepted || check.isPending}
                onClick={() => {
                  setChoice(index);
                  void submit({ kind: 'scenario_mc', choice: index });
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <form className={styles.form} onSubmit={onForm}>
          {question.kind === 'calculation' ? (
            <>
              <Input
                label="Your answer"
                name="value"
                inputMode="decimal"
                autoComplete="off"
                disabled={accepted}
                required
              />
              {question.units.length > 1 ? (
                <label className={styles.unit}>
                  <span>Unit</span>
                  <select name="unit" defaultValue={question.unit} disabled={accepted}>
                    {question.units.map((unit) => (
                      <option key={unit}>{unit}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className={styles.unitFixed}>in {question.unit}</p>
              )}
            </>
          ) : (
            <Input
              label="Your answer"
              name="text"
              autoComplete="off"
              disabled={accepted}
              required
            />
          )}
          <Button type="submit" variant="secondary" disabled={accepted || check.isPending}>
            Check
          </Button>
        </form>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div id={resultId} role="status" aria-live="polite">
        {result && result.feedback ? (
          <p
            className={[
              styles.feedback,
              result.accepted ? styles.feedbackRight : styles.feedbackWrong,
            ].join(' ')}
          >
            {result.accepted ? 'Accepted.' : 'Not yet.'}{' '}
            {/* The grader's text may open with its own verdict; don't say it twice. */}
            {result.feedback.replace(/^(Accepted[.:]?|Not accepted\.)\s*/, '')}
          </p>
        ) : accepted ? (
          <p className={[styles.feedback, styles.feedbackRight].join(' ')}>Accepted.</p>
        ) : null}
        {result?.explanation ? <p className={styles.explanation}>{result.explanation}</p> : null}
      </div>
    </section>
  );
}
