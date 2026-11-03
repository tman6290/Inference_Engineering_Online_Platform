import { exerciseFileUrl, type ExerciseResponse } from '@forward-pass/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { AnswerForm } from '../features/checkpoint/AnswerForm';
import { useExercise, useExerciseAnswer, useRevealSolution } from '../features/checkpoint/api';
import { BookMarkdown } from '../features/lesson/BookMarkdown';
import { PageHeader } from '../shell/PageHeader';
import { Button, Card, Chip, Eyebrow } from '../ui';
import styles from './ExercisePage.module.css';

const errorText = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Could not reach the server. Try again.';

function FileLinks({ exerciseId, files }: { exerciseId: string; files: string[] }) {
  return (
    <ul className={styles.files}>
      {files.map((file) => (
        <li key={file}>
          <a href={exerciseFileUrl(exerciseId, file)} download className={styles.file}>
            {file}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Exercise({ state }: { state: ExerciseResponse }) {
  const { exercise, solution } = state;
  const answer = useExerciseAnswer(exercise.id);
  const reveal = useRevealSolution(exercise.id);
  const [feedback, setFeedback] = useState<{ accepted: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const accepted = state.status === 'accepted';
  const downloads = [...exercise.starterFiles, ...(exercise.tests?.files ?? [])];

  return (
    <div className={styles.page}>
      <section aria-labelledby="brief" className={styles.block}>
        <h2 id="brief" className={styles.heading}>
          The brief
        </h2>
        <BookMarkdown markdown={exercise.brief} />
      </section>

      <section aria-labelledby="steps" className={styles.block}>
        <h2 id="steps" className={styles.heading}>
          Steps
        </h2>
        <ol className={styles.steps}>
          {exercise.steps.map((step) => (
            <li key={step}>
              <BookMarkdown markdown={step} />
            </li>
          ))}
        </ol>
      </section>

      {downloads.length || exercise.tests ? (
        <Card className={styles.block} aria-labelledby="files">
          <Eyebrow as="h2" id="files">
            Files and tests
          </Eyebrow>
          {downloads.length ? (
            <>
              <p>Download these into one folder:</p>
              <FileLinks exerciseId={exercise.id} files={downloads} />
            </>
          ) : null}
          {exercise.tests ? (
            <>
              <p>
                Run the tests on your machine, in that folder ({exercise.tests.runner}, CPU only):
              </p>
              <pre className={styles.command}>
                <code>{exercise.tests.command}</code>
              </pre>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card as="section" padding="lg" className={styles.block} aria-labelledby="answer">
        <div className={styles.answerHead}>
          <Eyebrow as="h2" id="answer" tone="accent">
            Check your result
          </Eyebrow>
          {accepted ? <Chip status="accepted">Accepted</Chip> : null}
          {state.tries && !accepted ? (
            <Chip status="upNext">
              {state.tries} {state.tries === 1 ? 'try' : 'tries'}
            </Chip>
          ) : null}
        </div>
        <AnswerForm
          key={String(accepted)}
          shape={
            exercise.answerKind === 'calculation'
              ? { kind: 'calculation', unit: exercise.units[0]!, units: exercise.units }
              : { kind: 'text' }
          }
          answerFormat={exercise.answerFormat}
          name={exercise.id}
          closed={accepted}
          pending={answer.isPending}
          lastAnswer={state.lastAnswer}
          lastAccepted={state.tries ? accepted : null}
          solution={null}
          submitLabel="Check my answer"
          onSubmit={(input) => {
            setError(null);
            answer.mutate(input, {
              onSuccess: (response) =>
                setFeedback({ accepted: response.result.accepted, text: response.result.feedback }),
              onError: (caught) => setError(errorText(caught)),
            });
          }}
        />
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div role="status" aria-live="polite">
          {feedback ? (
            <p className={feedback.accepted ? styles.right : styles.wrong}>
              <strong>{feedback.accepted ? 'Accepted.' : 'Not yet.'}</strong>{' '}
              {feedback.text.replace(/^Accepted[.:]?\s*/, '')}
            </p>
          ) : null}
        </div>
      </Card>

      {solution ? (
        <Card
          as="section"
          variant="dark"
          padding="lg"
          className={styles.block}
          aria-labelledby="solution"
        >
          <div className={styles.answerHead}>
            <Eyebrow as="h2" id="solution" tone="accent">
              Solution walkthrough
            </Eyebrow>
            {state.revealed && !accepted ? <Chip status="retry">Revealed</Chip> : null}
          </div>
          <BookMarkdown markdown={solution.walkthrough} />
          {solution.files.length ? (
            <>
              <p>Reference code:</p>
              <FileLinks exerciseId={exercise.id} files={solution.files} />
            </>
          ) : null}
        </Card>
      ) : confirmReveal ? (
        <Card className={styles.block}>
          <p>The reveal is logged on your record. Show the solution now?</p>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={reveal.isPending}
              onClick={() =>
                reveal.mutate(undefined, { onError: (caught) => setError(errorText(caught)) })
              }
            >
              Show the solution
            </Button>
            <Button variant="ghost" onClick={() => setConfirmReveal(false)}>
              Keep working
            </Button>
          </div>
        </Card>
      ) : (
        <div>
          <Button variant="ghost" onClick={() => setConfirmReveal(true)}>
            Stuck? See the solution
          </Button>
        </div>
      )}
    </div>
  );
}

export function ExercisePage() {
  const { sectionId = '', exerciseId = '' } = useParams();
  const query = useExercise(exerciseId);
  const data = query.data;

  return (
    <>
      <PageHeader
        eyebrow={`Exercise · ${sectionId}${data ? ` · ${data.exercise.estimatedMinutes} min` : ''}`}
        title={data?.exercise.title ?? 'Exercise'}
        description={
          <Link to={`/book/${sectionId}#exercises`} className={styles.back}>
            Back to {data?.section.title ?? 'the lesson'}
          </Link>
        }
      />
      {query.isPending ? (
        <p role="status">Loading the exercise…</p>
      ) : query.isError ? (
        <p role="alert">{errorText(query.error)}</p>
      ) : (
        <Exercise state={query.data} />
      )}
    </>
  );
}
