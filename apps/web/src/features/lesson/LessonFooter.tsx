import type { LessonResponse } from '@forward-pass/shared';
import { useState } from 'react';
import { ButtonLink, Card, ConfidencePills } from '../../ui';
import { useConfidence } from './api';
import styles from './LessonFooter.module.css';

/** Confidence rating, then the way onward: the checkpoint, or the next lesson. */
export function LessonFooter({ lesson }: { lesson: LessonResponse }) {
  const confidence = useConfidence(lesson.id);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className={styles.footer}>
      <div className={styles.rating}>
        <div className={styles.text}>
          <p className={styles.question} id="confidence-question">
            How solid is this {lesson.kind === 'section' ? 'section' : 'lesson'} for you?
          </p>
          <p className={styles.hint}>Shaky picks resurface on Home until you revisit them.</p>
        </div>
        <ConfidencePills
          legend={`How solid is ${lesson.title} for you?`}
          hideLegend
          value={lesson.progress.confidence}
          disabled={confidence.isPending}
          onChange={(level) => {
            setError(null);
            confidence.mutate(level, {
              onError: () => setError('Could not save your rating. Try again.'),
            });
          }}
        />
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {lesson.hasCheckpoint ? (
        <ButtonLink to={`/checkpoint/${lesson.id}`} block arrow>
          Take the {lesson.number} checkpoint
        </ButtonLink>
      ) : lesson.next ? (
        <ButtonLink to={`/book/${lesson.next.id}`} block arrow>
          Continue to{' '}
          {/^\d+\.\d+$/.test(lesson.next.id)
            ? `${lesson.next.id} ${lesson.next.title}`
            : lesson.next.title}
        </ButtonLink>
      ) : null}
    </Card>
  );
}
