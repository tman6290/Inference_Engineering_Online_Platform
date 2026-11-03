import type { ExerciseSummary } from '@forward-pass/shared';
import { Link } from 'react-router';
import { Chip, Eyebrow } from '../../ui';
import styles from './ExerciseList.module.css';

const statusChip = {
  new: null,
  tried: <Chip status="upNext">Tried</Chip>,
  accepted: <Chip status="accepted">Accepted</Chip>,
};

/** The lesson's hands-on tasks, each opening its own page. */
export function ExerciseList({
  lessonId,
  exercises,
}: {
  lessonId: string;
  exercises: ExerciseSummary[];
}) {
  if (!exercises.length) return null;
  return (
    <section id="exercises" aria-labelledby="exercises-title" className={styles.section}>
      <Eyebrow as="h2" id="exercises-title">
        Exercises
      </Eyebrow>
      <ul className={styles.list}>
        {exercises.map((exercise) => (
          <li key={exercise.id}>
            <Link to={`/book/${lessonId}/exercises/${exercise.id}`} className={styles.row}>
              <span className={styles.title}>{exercise.title}</span>
              <span className={styles.meta}>
                {exercise.estimatedMinutes} min{exercise.hasTests ? ' · code with tests' : ''}
              </span>
              {statusChip[exercise.status]}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
