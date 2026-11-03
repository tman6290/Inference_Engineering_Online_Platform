import { CHECKPOINT_SIZE, type CheckpointsResponse } from '@forward-pass/shared';
import { Link } from 'react-router';
import { useCheckpoints } from '../features/checkpoint/api';
import { PageHeader } from '../shell/PageHeader';
import { Card, Chip, Eyebrow } from '../ui';
import styles from './CheckpointsPage.module.css';

const pct = (value: number) => `${Math.round(value * 100)}%`;
const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

type SectionRow = CheckpointsResponse['sections'][number];

function statusOf(section: SectionRow) {
  if (section.openAttemptId) return <Chip status="reading">In progress</Chip>;
  if (section.passed) return <Chip status="accepted">Passed</Chip>;
  if (section.attempts) return <Chip status="retry">Not passed</Chip>;
  return <Chip status="queued">Not taken</Chip>;
}

function Sections({ sections }: { sections: SectionRow[] }) {
  const chapters = [...new Set(sections.map((section) => section.chapterNumber))];
  return (
    <>
      {chapters.map((chapter) => {
        const rows = sections.filter((section) => section.chapterNumber === chapter);
        return (
          <section key={chapter} className={styles.chapter} aria-labelledby={`cp-ch-${chapter}`}>
            <h2 id={`cp-ch-${chapter}`} className={styles.chapterTitle}>
              Chapter {chapter} · {rows[0]!.chapterTitle}
            </h2>
            <ul className={styles.rows}>
              {rows.map((section) => (
                <li key={section.number}>
                  <Link
                    to={
                      section.openAttemptId
                        ? `/checkpoint/${section.number}?attempt=${section.openAttemptId}`
                        : `/checkpoint/${section.number}`
                    }
                    className={styles.row}
                  >
                    <span className={styles.title}>
                      {section.number} {section.title}
                    </span>
                    <span className={styles.meta}>
                      {section.latest
                        ? `Last ${section.latest.firstTryAccepted}/${CHECKPOINT_SIZE} on ${day(section.latest.completedAt!)} · best ${pct(section.best ?? 0)} · ${section.attempts} attempt${section.attempts === 1 ? '' : 's'}`
                        : 'No attempts yet'}
                    </span>
                    {statusOf(section)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export function CheckpointsPage() {
  const query = useCheckpoints();
  const open = query.data?.sections.filter((section) => section.openAttemptId) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Checkpoints"
        title="Checkpoints"
        description="Ten questions per section, drawn from a bank of at least twenty-four. Pass with seven accepted on the first try."
      />
      {query.isPending ? (
        <p role="status">Loading checkpoints…</p>
      ) : query.isError ? (
        <p role="alert">Could not load checkpoints. Check that the API is running.</p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            {query.data.sections.length ? (
              <Sections sections={query.data.sections} />
            ) : (
              <p>No checkpoint banks are authored yet.</p>
            )}
          </div>
          <aside className={styles.rail} aria-label="Queues">
            <Card className={styles.card}>
              <Eyebrow as="h2">Open attempts</Eyebrow>
              {open.length ? (
                <ul className={styles.list}>
                  {open.map((section) => (
                    <li key={section.number}>
                      <Link to={`/checkpoint/${section.number}?attempt=${section.openAttemptId}`}>
                        Resume {section.number} {section.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>Nothing half-finished.</p>
              )}
            </Card>
            <Card variant="dark" className={styles.card}>
              <Eyebrow as="h2" tone="accent">
                Recall queue
              </Eyebrow>
              {query.data.recall.length ? (
                <ul className={styles.list}>
                  {query.data.recall.map((item) => (
                    <li key={item.lessonId}>
                      <Link to={`/checkpoint/${item.lessonId}`}>
                        {item.lessonId} {item.title}
                      </Link>
                      <span className={styles.muted}>
                        {' '}
                        · rated {item.confidence} on {day(item.ratedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>
                  Sections come back here 21 days after you rate them solid, or 10 days after okay.
                </p>
              )}
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}
