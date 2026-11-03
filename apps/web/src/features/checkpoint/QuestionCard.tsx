import { MAX_TRIES, type AnswerInput, type AttemptQuestion } from '@forward-pass/shared';
import { forwardRef } from 'react';
import { Link } from 'react-router';
import { Card, Chip, Eyebrow } from '../../ui';
import { AnswerForm, type AnswerShape } from './AnswerForm';
import styles from './QuestionCard.module.css';

const kindWords = { scenario_mc: 'Scenario', calculation: 'Calculation', text: 'Short answer' };

/** "5.2.1" → "/book/5.2"; "5.2" and "preface" link to themselves. */
export function rereadLink(reread: string): string {
  const parts = reread.split('.');
  return `/book/${parts.length > 2 ? parts.slice(0, 2).join('.') : reread}`;
}

function shapeOf(entry: AttemptQuestion): AnswerShape {
  const { question } = entry;
  if (question.kind === 'scenario_mc') return { kind: 'scenario_mc', options: question.options };
  if (question.kind === 'calculation') {
    return {
      kind: 'calculation',
      unit: question.unit,
      units: question.units,
      tolerance: question.tolerance,
    };
  }
  return { kind: 'text' };
}

export function StatusChip({ entry }: { entry: AttemptQuestion }) {
  if (entry.status === 'accepted') {
    return entry.firstTry === 'accepted' ? (
      <Chip status="accepted">Accepted first try</Chip>
    ) : (
      <Chip status="retry">Accepted on retry</Chip>
    );
  }
  if (entry.status === 'missed') return <Chip status="retry">Missed</Chip>;
  return entry.tries ? (
    <Chip status="upNext">
      Try {entry.tries + 1} of {MAX_TRIES}
    </Chip>
  ) : null;
}

interface QuestionCardProps {
  entry: AttemptQuestion;
  index: number;
  total: number;
  pending: boolean;
  hintPending: boolean;
  onAnswer: (answer: AnswerInput) => void;
  onHint: () => void;
}

/** One checkpoint question: prompt, answer, hint, then the verdict and explanation. */
export const QuestionCard = forwardRef<HTMLHeadingElement, QuestionCardProps>(function QuestionCard(
  { entry, index, total, pending, hintPending, onAnswer, onHint },
  headingRef,
) {
  const { question } = entry;
  const closed = entry.status !== 'open';
  const lastAccepted = entry.tries ? entry.status === 'accepted' : null;
  const headingId = `question-${question.id}`;

  return (
    <Card as="section" padding="lg" className={styles.card} aria-labelledby={headingId}>
      <div className={styles.top}>
        <Eyebrow>
          Question {index + 1} of {total} · {kindWords[question.kind]}
          {question.subsectionNumber ? ` · ${question.subsectionNumber}` : ''}
        </Eyebrow>
        <StatusChip entry={entry} />
      </div>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.prompt}>
        {question.prompt}
      </h2>

      <AnswerForm
        // A fresh form per question and per closing, so inputs reset and show the final state.
        key={`${question.id}-${closed}`}
        shape={shapeOf(entry)}
        answerFormat={question.answerFormat}
        name={question.id}
        closed={closed}
        pending={pending}
        lastAnswer={entry.lastAnswer}
        lastAccepted={lastAccepted}
        solution={entry.solution}
        onSubmit={onAnswer}
      />

      {closed && !entry.hint ? null : (
        <details
          className={styles.hint}
          open={Boolean(entry.hint)}
          onToggle={(event) => {
            if (event.currentTarget.open && !entry.hint && !hintPending) onHint();
          }}
        >
          <summary>
            {question.kind === 'calculation' ? 'Method hint' : 'Hint'}
            <span className={styles.hintNote}> · logged, not hidden</span>
          </summary>
          <p>{entry.hint ?? (hintPending ? 'Loading the hint…' : '')}</p>
        </details>
      )}

      <div role="status" aria-live="polite" className={styles.verdict}>
        {entry.feedback && !closed ? (
          <p className={styles.feedbackWrong}>
            <strong>Not yet.</strong> {entry.feedback}
          </p>
        ) : null}
      </div>

      {closed ? (
        <Card variant="dark" className={styles.explanation} aria-label="Explanation">
          <p className={styles.verdictLine}>
            {entry.status === 'accepted'
              ? entry.firstTry === 'accepted'
                ? 'Accepted on the first try.'
                : `Accepted on try ${entry.tries}.`
              : 'Closed after three misses. Here is the reasoning.'}
          </p>
          {entry.feedback && entry.status === 'accepted' ? <p>{entry.feedback}</p> : null}
          {entry.explanation ? <p>{entry.explanation}</p> : null}
          {entry.workedSolution ? (
            <div className={styles.worked}>
              <Eyebrow tone="accent">Worked solution</Eyebrow>
              <p>{entry.workedSolution}</p>
            </div>
          ) : null}
          {entry.reread ? (
            <Link className={styles.reread} to={rereadLink(entry.reread)}>
              Re-read {entry.reread}
            </Link>
          ) : null}
        </Card>
      ) : null}
    </Card>
  );
});
