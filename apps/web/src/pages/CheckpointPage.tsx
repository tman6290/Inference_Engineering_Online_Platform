import {
  CHECKPOINT_PASS,
  CHECKPOINT_SIZE,
  type AttemptQuestion,
  type AttemptResponse,
  type CheckpointSectionResponse,
} from '@forward-pass/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/auth';
import {
  useAttempt,
  useAttemptAnswer,
  useAttemptHint,
  useCheckpointSection,
  useFinishAttempt,
  useStartAttempt,
} from '../features/checkpoint/api';
import { QuestionCard, StatusChip } from '../features/checkpoint/QuestionCard';
import { PageHeader } from '../shell/PageHeader';
import {
  Button,
  ButtonLink,
  Card,
  Eyebrow,
  LockIcon,
  ProgressBar,
  SegmentedProgress,
  type SegmentState,
} from '../ui';
import styles from './CheckpointPage.module.css';

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** Ten questions and 7 to pass for a checkpoint; a recall attempt passes at 70% of its questions. */
function barOf(state: AttemptResponse) {
  const total = state.questions.length || CHECKPOINT_SIZE;
  const recall = state.attempt.kind === 'recall';
  return { total, recall, pass: recall ? Math.ceil(0.7 * total) : CHECKPOINT_PASS };
}
const errorText = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Could not reach the server. Try again.';

function segmentOf(entry: AttemptQuestion, current: boolean): SegmentState {
  if (entry.status === 'accepted') return entry.firstTry === 'accepted' ? 'accepted' : 'retry';
  if (entry.status === 'missed') return 'missed';
  return current ? 'current' : 'empty';
}

function ProjectCard({ project }: { project: AttemptResponse['project'] }) {
  return (
    <Card variant={project?.unlocked ? 'tinted' : 'dashed'} className={styles.railCard}>
      <Eyebrow>Unlocks on pass</Eyebrow>
      {project ? (
        <p className={styles.railText}>
          {!project.unlocked ? <LockIcon size={16} className={styles.inlineIcon} /> : null}
          {project.unlocked
            ? `The Chapter ${project.chapterNumber} project is open.`
            : `The Chapter ${project.chapterNumber} project: ${project.chapterTitle}. This is the chapter's last checkpoint.`}
        </p>
      ) : (
        <p className={styles.railText}>
          A pass counts toward this section&apos;s mastery. Pass with {CHECKPOINT_PASS} of{' '}
          {CHECKPOINT_SIZE} accepted on the first try.
        </p>
      )}
    </Card>
  );
}

function DuelCard({ section }: { section: string }) {
  const { me } = useAuth();
  const partner = me?.pod.find((member) => member.id !== me.user.id);
  return (
    <Card variant="tinted" className={styles.railCard}>
      <Eyebrow>Duel</Eyebrow>
      <p className={styles.railText}>
        {partner
          ? `Duel ${partner.displayName} on ${section}: the same ten questions, taken alone within 48 hours.`
          : `Once your partner joins, you can duel on ${section}: the same ten questions, taken alone within 48 hours.`}
      </p>
      <p className={styles.railNote}>Duels open in a later build.</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// Start screen

function StartScreen({ data }: { data: CheckpointSectionResponse }) {
  const start = useStartAttempt(data.section.number);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const resume = data.openAttemptId;

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <Card padding="lg" className={styles.intro}>
          <Eyebrow>How it works</Eyebrow>
          <ul className={styles.rules}>
            <li>
              Ten questions from a bank of {data.bankSize}: four scenarios, three calculations and
              three short answers.
            </li>
            <li>
              You pass with {CHECKPOINT_PASS} right on the first try. Each question gives you three
              tries, and your record keeps the retries.
            </li>
            <li>Opening a hint goes on your record too.</li>
          </ul>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          <div>
            {resume ? (
              <ButtonLink to={`?attempt=${resume}`} arrow>
                Resume your attempt
              </ButtonLink>
            ) : (
              <Button
                arrow
                disabled={start.isPending}
                onClick={() => {
                  setError(null);
                  start.mutate(undefined, {
                    onSuccess: (state) => void navigate(`?attempt=${state.attempt.id}`),
                    onError: (caught) => setError(errorText(caught)),
                  });
                }}
              >
                {start.isPending ? 'Drawing questions…' : 'Start the checkpoint'}
              </Button>
            )}
          </div>
        </Card>

        <section aria-labelledby="history" className={styles.history}>
          <h2 id="history" className={styles.sectionTitle}>
            Your attempts
          </h2>
          {data.attempts.length ? (
            <ul className={styles.historyList}>
              {data.attempts.map((attempt) => (
                <li key={attempt.id}>
                  <Link to={`?attempt=${attempt.id}`} className={styles.historyRow}>
                    <span>
                      {new Date(attempt.completedAt ?? attempt.startedAt).toLocaleDateString(
                        'en-GB',
                        { day: 'numeric', month: 'short', year: 'numeric' },
                      )}
                    </span>
                    <span className={styles.mono}>
                      {attempt.firstTryAccepted}/{CHECKPOINT_SIZE} · {pct(attempt.acceptance)}
                      {attempt.hints
                        ? ` · ${attempt.hints} hint${attempt.hints > 1 ? 's' : ''}`
                        : ''}
                    </span>
                    <span className={attempt.passed ? styles.pass : styles.fail}>
                      {attempt.passed ? 'Passed' : 'Not passed'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.muted}>No finished attempts yet.</p>
          )}
        </section>
      </div>
      <aside className={styles.rail} aria-label="Checkpoint details">
        <ProjectCard project={data.project} />
        <DuelCard section={data.section.number} />
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// An attempt

function Result({ state }: { state: AttemptResponse }) {
  const start = useStartAttempt(state.section.number);
  const navigate = useNavigate();
  const { attempt } = state;
  const { total, recall, pass } = barOf(state);
  return (
    <Card variant="dark" padding="lg" className={styles.result} aria-labelledby="result-title">
      <Eyebrow tone="accent">{attempt.passed ? 'Passed' : 'Not passed yet'}</Eyebrow>
      <h2 id="result-title" className={styles.resultTitle}>
        {attempt.firstTryAccepted} of {total} accepted on the first try
      </h2>
      <p className={styles.resultText}>
        {recall
          ? 'Every section here has left the queue. A section with two misses in a row also dropped a confidence level.'
          : attempt.passed
            ? `That clears the bar of ${pass}.`
            : `The bar is ${pass}. Re-read the subsections linked under each miss, then try a fresh draw.`}
        {attempt.hints ? ` ${attempt.hints} hint${attempt.hints > 1 ? 's' : ''} used.` : ''}
      </p>
      <div className={styles.resultActions}>
        {state.next ? (
          <ButtonLink to={`/book/${state.next.id}`} variant="onDark">
            Continue to {state.next.title}
          </ButtonLink>
        ) : null}
        {recall ? (
          <ButtonLink to="/progress" variant="ghost">
            Back to Progress
          </ButtonLink>
        ) : (
          <Button
            variant="ghost"
            disabled={start.isPending}
            onClick={() =>
              start.mutate(undefined, {
                onSuccess: (fresh) => void navigate(`?attempt=${fresh.attempt.id}`),
              })
            }
          >
            New attempt
          </Button>
        )}
      </div>
    </Card>
  );
}

export function AttemptView({ state }: { state: AttemptResponse }) {
  const { attempt, questions } = state;
  const { total, recall, pass } = barOf(state);
  const done = attempt.completedAt !== null;
  const firstOpen = questions.findIndex((entry) => entry.status === 'open');
  const [selected, setSelected] = useState(firstOpen >= 0 ? firstOpen : 0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  const answer = useAttemptAnswer(attempt.id);
  const hint = useAttemptHint(attempt.id);
  const finish = useFinishAttempt(attempt.id);

  // Focus the question when the learner moves to another one, not on first render.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [selected]);

  const go = (index: number) => {
    moved.current = true;
    setSelected(index);
  };
  const current = questions[selected]!;
  const nextOpen = questions.findIndex(
    (entry, index) => index > selected && entry.status === 'open',
  );
  const anyOpen = questions.findIndex((entry) => entry.status === 'open');
  const closedRows = questions
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => entry.status !== 'open' && index !== selected);

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <SegmentedProgress
          label="Questions closed"
          segments={questions.map((entry, index) => segmentOf(entry, index === selected))}
        />

        {done ? <Result state={state} /> : null}

        {closedRows.length ? (
          <section aria-labelledby="closed-rows">
            <h2 id="closed-rows" className="visually-hidden">
              Answered questions
            </h2>
            <ul className={styles.rows}>
              {closedRows.map(({ entry, index }) => (
                <li key={entry.question.id}>
                  <button type="button" className={styles.row} onClick={() => go(index)}>
                    <span className={styles.rowNumber}>{index + 1}</span>
                    <span className={styles.rowPrompt}>{entry.question.prompt}</span>
                    <StatusChip entry={entry} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <QuestionCard
          ref={headingRef}
          entry={current}
          index={selected}
          total={questions.length}
          pending={answer.isPending}
          hintPending={hint.isPending}
          onAnswer={(input) => {
            setError(null);
            answer.mutate(
              { questionId: current.question.id, answer: input, usedHint: current.usedHint },
              { onError: (caught) => setError(errorText(caught)) },
            );
          }}
          onHint={() =>
            hint.mutate(current.question.id, { onError: (caught) => setError(errorText(caught)) })
          }
        />
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}

        {current.status !== 'open' && !done ? (
          <div>
            <Button
              arrow
              onClick={() => go(nextOpen >= 0 ? nextOpen : anyOpen >= 0 ? anyOpen : selected)}
            >
              Next question
            </Button>
          </div>
        ) : null}
      </div>

      <aside className={styles.rail} aria-label="Attempt">
        <Card className={styles.railCard}>
          <Eyebrow id="question-map">Question map</Eyebrow>
          <ol className={styles.map} aria-labelledby="question-map">
            {questions.map((entry, index) => {
              const segment = segmentOf(entry, false);
              return (
                <li key={entry.question.id}>
                  <button
                    type="button"
                    className={[
                      styles.mapCell,
                      styles[segment],
                      index === selected ? styles.here : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-current={index === selected ? 'step' : undefined}
                    aria-label={`Question ${index + 1}, ${
                      entry.status === 'open'
                        ? entry.tries
                          ? 'open, tried'
                          : 'not answered'
                        : entry.status === 'missed'
                          ? 'missed'
                          : entry.firstTry === 'accepted'
                            ? 'accepted first try'
                            : 'accepted on retry'
                    }`}
                    onClick={() => go(index)}
                  >
                    {index + 1}
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card variant="dark" className={styles.railCard}>
          <Eyebrow tone="accent">Acceptance</Eyebrow>
          <p className={styles.meterValue}>
            {attempt.firstTryAccepted}
            <span className={styles.meterUnit}>/{total}</span>
          </p>
          <ProgressBar
            value={attempt.acceptance * 100}
            label="First-try acceptance"
            valueText={`${attempt.firstTryAccepted} of ${total} accepted on the first try`}
            hideLabel
          />
          <p className={styles.railNote}>
            Pass at {pass}. Only first tries count; retries and hints go on your record.
          </p>
        </Card>

        {recall ? null : (
          <>
            <ProjectCard project={state.project} />
            <DuelCard section={state.section.number} />
          </>
        )}

        {done ? null : confirmEnd ? (
          <Card className={styles.railCard}>
            <p className={styles.railText}>Open questions count as missed. End the attempt?</p>
            <div className={styles.confirm}>
              <Button
                variant="secondary"
                disabled={finish.isPending}
                onClick={() => finish.mutate(undefined, { onSettled: () => setConfirmEnd(false) })}
              >
                End attempt
              </Button>
              <Button variant="ghost" onClick={() => setConfirmEnd(false)}>
                Keep going
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmEnd(true)}>
            End attempt now
          </Button>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function CheckpointPage() {
  const { sectionId = '' } = useParams();
  const [params] = useSearchParams();
  const attemptId = params.get('attempt');
  const section = useCheckpointSection(sectionId);
  const attempt = useAttempt(attemptId);

  const title = section.data?.section.title ?? attempt.data?.section.title ?? 'Checkpoint';
  const header = (
    <PageHeader
      eyebrow={`Checkpoint · ${sectionId}`}
      title={title}
      description={
        <Link to={`/book/${sectionId}`} className={styles.back}>
          Back to the lesson
        </Link>
      }
    />
  );

  if (attemptId) {
    return (
      <>
        {header}
        {attempt.isPending ? (
          <p role="status">Loading the attempt…</p>
        ) : attempt.isError ? (
          <p role="alert">{errorText(attempt.error)}</p>
        ) : (
          <AttemptView key={attempt.data.attempt.id} state={attempt.data} />
        )}
      </>
    );
  }
  return (
    <>
      {header}
      {section.isPending ? (
        <p role="status">Loading the checkpoint…</p>
      ) : section.isError ? (
        <p role="alert">{errorText(section.error)}</p>
      ) : (
        <StartScreen data={section.data} />
      )}
    </>
  );
}
