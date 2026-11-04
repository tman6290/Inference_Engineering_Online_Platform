import { SECTION_COUNT, type ProgressPage as ProgressData } from '@forward-pass/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProgress, useStartRecall } from '../features/progress/api';
import { WEEKDAYS, percent, plural, shortDate } from '../features/progress/format';
import { Heatmap } from '../features/progress/Heatmap';
import { PortfolioCard } from '../features/portfolio/PortfolioCard';
import { PageHeader } from '../shell/PageHeader';
import { Button, Card, Eyebrow, StatTile } from '../ui';
import styles from './ProgressPage.module.css';

function MasteryBar({
  value,
  who,
  tone,
}: {
  value: number;
  who: string;
  tone: 'mine' | 'partner';
}) {
  return (
    <div className={styles.barRow}>
      <span className={styles.barWho}>{who}</span>
      <span
        className={styles.track}
        role="meter"
        aria-label={`${who} mastery`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        <span
          className={[styles.fill, styles[tone]].join(' ')}
          style={{ width: `${value * 100}%` }}
        />
      </span>
      <span className={styles.barValue}>{percent(value)}</span>
    </div>
  );
}

function Mastery({ data }: { data: ProgressData }) {
  const partner = data.partner?.displayName;
  return (
    <Card as="section" padding="lg" className={styles.card} aria-labelledby="mastery-title">
      <h2 id="mastery-title" className={styles.cardTitle}>
        Mastery by chapter
      </h2>
      <p className={styles.muted}>
        70% your latest checkpoint, 30% your confidence. A section without a checkpoint counts as
        zero.
      </p>
      <ul className={styles.chapters}>
        {data.mastery.map((chapter) => (
          <li key={chapter.number}>
            <details className={styles.chapter}>
              <summary>
                <span className={styles.chapterName}>
                  {chapter.number} · {chapter.title}
                </span>
                <MasteryBar value={chapter.mine} who="You" tone="mine" />
                {chapter.partner !== null && partner ? (
                  <MasteryBar value={chapter.partner} who={partner} tone="partner" />
                ) : null}
              </summary>
              <ul className={styles.sections}>
                {chapter.sections.map((section) => (
                  <li key={section.number} className={styles.section}>
                    <span>
                      {section.number} {section.title}
                    </span>
                    <span className={styles.mono}>
                      {percent(section.mine)}
                      {section.partner !== null && partner
                        ? ` · ${partner} ${percent(section.partner)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Patterns({ data }: { data: ProgressData }) {
  const { patterns, partner, uptime, stats } = data;
  const rows: [string, string][] = [
    [
      'Best day',
      patterns.bestWeekday === null ? 'Not enough study yet' : WEEKDAYS[patterns.bestWeekday]!,
    ],
    [
      'Typical session',
      patterns.typicalSessionMinutes === null
        ? 'No sessions yet'
        : `${patterns.typicalSessionMinutes} min`,
    ],
    [
      'Last gap',
      patterns.lastGapDays === null ? 'No breaks so far' : plural(patterns.lastGapDays, 'day'),
    ],
  ];
  if (partner) {
    rows.push([
      `You and ${partner.displayName}`,
      `${stats.sectionsPerWeek} vs ${partner.sectionsPerWeek} sections a week, ${uptime.current} vs ${partner.uptime} days of uptime`,
    ]);
  }
  return (
    <Card
      as="section"
      variant="dark"
      padding="lg"
      className={styles.card}
      aria-labelledby="patterns-title"
    >
      <Eyebrow as="h2" id="patterns-title" tone="accent">
        Patterns
      </Eyebrow>
      <dl className={styles.patterns}>
        {rows.map(([term, value]) => (
          <div key={term} className={styles.pattern}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** The recall card lists this many due sections. */
const SHOWN = 6;

function Recall({ items }: { items: ProgressData['recall'] }) {
  const start = useStartRecall();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card as="section" padding="lg" className={styles.card} aria-labelledby="recall-title">
      <h2 id="recall-title" className={styles.cardTitle}>
        Recall queue
      </h2>
      {items.length ? (
        <>
          <ul className={styles.recall}>
            {items.slice(0, SHOWN).map((item) => (
              <li key={item.lessonId}>
                <span className={styles.recallTitle}>
                  {item.lessonId} {item.title}
                </span>
                <span className={styles.muted}>
                  {' '}
                  · rated {item.confidence} on {shortDate(item.ratedAt.slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
          {items.length > SHOWN ? (
            <p className={styles.muted}>and {items.length - SHOWN} more</p>
          ) : null}
          <p className={styles.muted}>
            Recall asks three questions on each of the four oldest sections that have a checkpoint.
            Two misses in a row drop that section&apos;s rating a level.
          </p>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          <div>
            <Button
              arrow
              disabled={start.isPending}
              onClick={() =>
                start.mutate(undefined, {
                  onSuccess: (state) => void navigate(`/recall?attempt=${state.attempt.id}`),
                  onError: (caught) =>
                    setError(
                      caught instanceof ApiRequestError
                        ? caught.message
                        : 'Could not start recall.',
                    ),
                })
              }
            >
              Start recall
            </Button>
          </div>
        </>
      ) : (
        <p className={styles.muted}>
          Sections come back 21 days after you rate them solid, or 10 days after okay.
        </p>
      )}
    </Card>
  );
}

export function ProgressPage() {
  const query = useProgress();
  const data = query.data;

  return (
    <>
      <PageHeader
        eyebrow="Progress"
        title="Progress"
        description={
          data ? `${data.stats.decoded} of ${SECTION_COUNT} sections decoded.` : undefined
        }
      />
      {query.isPending ? (
        <p role="status">Loading progress…</p>
      ) : query.isError ? (
        <p role="alert">Could not load progress. Check that the API is running.</p>
      ) : (
        <div className={styles.page}>
          <div className={styles.tiles}>
            <StatTile
              label="Reading time"
              value={`${data!.stats.readingHours}h`}
              caption="in total"
            />
            <StatTile
              label="Longest uptime"
              value={String(data!.uptime.longest)}
              unit={data!.uptime.longest === 1 ? ' day' : ' days'}
              caption={`current streak ${plural(data!.uptime.current, 'day')}`}
            />
            <StatTile
              label="Pace"
              value={String(data!.stats.sectionsPerWeek)}
              unit="/week"
              caption={
                data!.stats.projectedFinish
                  ? `finish around ${shortDate(data!.stats.projectedFinish)}`
                  : 'read a section to set a pace'
              }
            />
            <StatTile
              label="Lifetime acceptance"
              value={percent(data!.stats.acceptanceRate)}
              caption="first-try answers across everything"
              dark
            />
          </div>

          <div className={styles.split}>
            <Card as="section" padding="lg" className={styles.card} aria-labelledby="heatmap-title">
              <h2 id="heatmap-title" className={styles.cardTitle}>
                Study days
              </h2>
              <Heatmap days={data!.days} />
            </Card>
            <Patterns data={data!} />
          </div>

          <div className={styles.split}>
            <Mastery data={data!} />
            <div className={styles.column}>
              <Recall items={data!.recall} />
              <PortfolioCard className={styles.card} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
