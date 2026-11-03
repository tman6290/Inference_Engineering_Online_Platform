import { Link, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useAttempt } from '../features/checkpoint/api';
import { PageHeader } from '../shell/PageHeader';
import { AttemptView } from './CheckpointPage';
import styles from './CheckpointPage.module.css';

/** A recall attempt: three questions from each section due for review. Started from Progress. */
export function RecallPage() {
  const [params] = useSearchParams();
  const attemptId = params.get('attempt');
  const attempt = useAttempt(attemptId);

  return (
    <>
      <PageHeader
        eyebrow="Recall"
        title={attempt.data?.section.title ?? 'Recall'}
        description={
          <Link to="/progress" className={styles.back}>
            Back to Progress
          </Link>
        }
      />
      {!attemptId ? (
        <p>
          Start a recall attempt from the <Link to="/progress">Progress</Link> page.
        </p>
      ) : attempt.isPending ? (
        <p role="status">Loading the attempt…</p>
      ) : attempt.isError ? (
        <p role="alert">
          {attempt.error instanceof ApiRequestError
            ? attempt.error.message
            : 'Could not load the attempt.'}
        </p>
      ) : (
        <AttemptView key={attempt.data.attempt.id} state={attempt.data} />
      )}
    </>
  );
}
