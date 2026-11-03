import { SECTION_COUNT, type HomeResponse } from '@forward-pass/shared';
import { Link } from 'react-router';
import { useAuth } from '../auth/auth';
import { ChapterPipeline } from '../features/book/ChapterPipeline';
import { useBook } from '../features/lesson/api';
import { useHome } from '../features/progress/api';
import { ago, duration, longDate, percent } from '../features/progress/format';
import { PageHeader } from '../shell/PageHeader';
import { ButtonLink, Card, Eyebrow, LockIcon, ProgressBar, StatTile } from '../ui';
import { greeting } from './pages';
import styles from './HomePage.module.css';

function ContinueCard({ data }: { data: HomeResponse['continue'] }) {
  if (!data) {
    return (
      <Card variant="dark" padding="lg" className={styles.continue}>
        <Eyebrow tone="accent">Continue decoding</Eyebrow>
        <h2 className={styles.continueTitle}>You have read every lesson.</h2>
        <p className={styles.continueText}>The recall queue on Progress keeps them fresh.</p>
        <div className={styles.actions}>
          <ButtonLink to="/progress" variant="onDark">
            Open Progress
          </ButtonLink>
        </div>
      </Card>
    );
  }
  const where = [
    data.chapter ? `Chapter ${data.chapter.number} · ${data.chapter.title}` : 'Start here',
    data.position ? `Section ${data.position.index} of ${data.position.of}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Card
      as="section"
      variant="dark"
      padding="lg"
      className={styles.continue}
      aria-labelledby="continue-title"
    >
      <Eyebrow tone="accent">Continue decoding</Eyebrow>
      <p className={styles.where}>{where}</p>
      <h2 id="continue-title" className={styles.continueTitle}>
        {data.number ? `${data.number} ` : ''}
        {data.title}
      </h2>
      <p className={styles.continueText}>
        {data.maxScrollPct > 0
          ? `You're ${data.maxScrollPct}% through, with about ${data.minutesLeft} min to go.`
          : `About ${data.minutesLeft} min of reading.`}
        {data.hasCheckpoint ? ` The ${data.number} checkpoint comes after.` : ''}
      </p>
      <ProgressBar
        value={data.maxScrollPct}
        label="Section progress"
        valueText={`${data.maxScrollPct}% · ~${data.minutesLeft} min left`}
        className={styles.bar}
      />
      <div className={styles.actions}>
        <ButtonLink to={`/book/${data.lessonId}`} variant="onDark" arrow>
          {data.maxScrollPct > 0 ? 'Resume reading' : 'Start reading'}
        </ButtonLink>
        {data.hasCheckpoint ? (
          <ButtonLink to={`/checkpoint/${data.lessonId}`} variant="ghost">
            Skip to checkpoint
          </ButtonLink>
        ) : null}
      </div>
    </Card>
  );
}

function WeekBars({ days, goal }: { days: number[]; goal: number }) {
  const daily = goal / 7;
  return (
    <span className={styles.weekBars} aria-hidden="true">
      {days.map((minutes, index) => (
        <span
          key={index}
          className={styles.weekBar}
          style={{ height: `${Math.max(3, Math.min(28, (minutes / daily) * 20))}px` }}
        />
      ))}
    </span>
  );
}

function Tiles({ tiles, today }: { tiles: HomeResponse['tiles']; today: string }) {
  const elapsed = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const onPace = tiles.weekMinutes >= (tiles.weekGoalMinutes * elapsed) / 7;
  return (
    <div className={styles.tiles}>
      <StatTile
        label="Decode progress"
        value={`${Math.round((tiles.decoded / SECTION_COUNT) * 100)}%`}
        caption={`${tiles.decoded} of ${SECTION_COUNT} sections read`}
        progress={(tiles.decoded / SECTION_COUNT) * 100}
      />
      <StatTile
        label="Acceptance rate"
        value={percent(tiles.acceptanceRate)}
        caption={tiles.acceptanceRate === null ? 'No answers yet' : 'answers accepted first try'}
        progress={tiles.acceptanceRate === null ? undefined : tiles.acceptanceRate * 100}
      />
      <StatTile
        label="Projects shipped"
        value={String(tiles.projectsShipped)}
        unit={`/${tiles.projectsTotal}`}
        caption="Each chapter's last checkpoint opens its project"
        footer={<Link to="/projects">Projects</Link>}
      />
      <StatTile
        label="This week"
        value={duration(tiles.weekMinutes)}
        caption={`goal ${duration(tiles.weekGoalMinutes)} · ${onPace ? 'on pace' : 'behind pace'}`}
        footer={<WeekBars days={tiles.weekDays} goal={tiles.weekGoalMinutes} />}
      />
    </div>
  );
}

function Standings({ rows }: { rows: HomeResponse['standings'] }) {
  return (
    <Card as="section" padding="lg" className={styles.standings} aria-labelledby="standings-title">
      <h2 id="standings-title" className={styles.cardTitle}>
        Pod standings
      </h2>
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Pod standings table">
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Learner</th>
              <th scope="col">Decoded</th>
              <th scope="col">Acceptance</th>
              <th scope="col">Projects</th>
              <th scope="col">Uptime</th>
              <th scope="col">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row">
                  <span className={styles.learner}>
                    <span
                      className={[styles.avatar, styles[row.colour]].join(' ')}
                      aria-hidden="true"
                    >
                      {row.initial}
                    </span>
                    {row.displayName}
                    {row.isYou ? <span className={styles.you}>you</span> : null}
                  </span>
                </th>
                <td>
                  {row.decoded} / {SECTION_COUNT}
                </td>
                <td>{percent(row.acceptanceRate)}</td>
                <td>{row.projectsShipped}</td>
                <td>{row.uptime}d</td>
                <td className={styles.lastActive}>
                  {row.lastActivity
                    ? `${row.lastActivity.lessonId} ${row.lastActivity.title}, ${ago(row.lastActivity.at)}`
                    : 'Not started'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length < 2 ? (
        <p className={styles.muted}>Standings fill in once your partner takes the second seat.</p>
      ) : null}
      <Card variant="tinted" className={styles.duel}>
        <p>
          <strong>Duels:</strong> you each take a fresh 10-question checkpoint on one section,
          alone, within 48 hours. Higher first-try acceptance wins and fewer hints breaks a tie. The
          loser records a 3-minute teach-back on the questions they missed.
        </p>
      </Card>
    </Card>
  );
}

function NextProject({ project }: { project: HomeResponse['nextProject'] }) {
  if (!project) return null;
  return (
    <Card as="section" padding="lg" className={styles.side} aria-labelledby="next-project">
      <Eyebrow>
        Next project ·{' '}
        {project.unlocked ? 'open' : `unlocks after the ${project.unlockAfter} checkpoint`}
      </Eyebrow>
      <h2 id="next-project" className={styles.cardTitle}>
        {!project.unlocked ? <LockIcon size={18} className={styles.lock} /> : null}
        Chapter {project.chapterNumber} · {project.chapterTitle}
      </h2>
      <p className={styles.muted}>
        {project.unlocked
          ? 'Its brief, rubric and checks are on the Projects page.'
          : `Pass the ${project.unlockAfter} checkpoint to open the brief.`}
      </p>
      <ButtonLink to="/projects" variant={project.unlocked ? 'primary' : 'secondary'} block>
        {project.unlocked ? 'Read the brief' : 'See projects'}
      </ButtonLink>
    </Card>
  );
}

function Shaky({ items }: { items: HomeResponse['shaky'] }) {
  return (
    <Card as="section" padding="lg" className={styles.side} aria-labelledby="shaky-title">
      <h2 id="shaky-title" className={styles.cardTitle}>
        Shaky concepts
      </h2>
      {items.length ? (
        <ul className={styles.shakyList}>
          {items.map((item) => (
            <li key={item.lessonId} className={styles.shakyItem}>
              <span>
                <span className={styles.shakyTitle}>{item.title}</span>{' '}
                <span className={styles.muted}>
                  · {item.lessonId} ·{' '}
                  {item.reason === 'rated-shaky'
                    ? 'you rated it shaky'
                    : `last checkpoint ${percent(item.acceptance)}`}
                </span>
              </span>
              <Link to={`/book/${item.lessonId}`} className={styles.review}>
                Review <span className="visually-hidden">{item.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>
          Nothing shaky. Sections you rate shaky, or score under 60% on, show up here.
        </p>
      )}
    </Card>
  );
}

export function HomePage() {
  const { me } = useAuth();
  const home = useHome();
  const book = useBook();
  const data = home.data;

  return (
    <>
      <PageHeader
        eyebrow={data ? longDate(data.today) : undefined}
        title={me ? `${greeting()}, ${me.user.displayName}.` : `${greeting()}.`}
      />
      {home.isPending ? (
        <p role="status">Loading your progress…</p>
      ) : home.isError ? (
        <p role="alert">Could not load Home. Check that the API is running.</p>
      ) : (
        <div className={styles.page}>
          <div className={styles.top}>
            <ContinueCard data={data!.continue} />
            <Tiles tiles={data!.tiles} today={data!.today} />
          </div>

          <section aria-labelledby="pipeline-title" className={styles.pipeline}>
            <div className={styles.sectionHead}>
              <h2 id="pipeline-title" className={styles.sectionTitle}>
                The book as a pipeline
              </h2>
              <p className={styles.muted}>
                Eight chapters, {SECTION_COUNT} sections, seven projects. Each chapter builds on the
                one before.
              </p>
              <Link to="/book" className={styles.tocLink}>
                Table of contents
              </Link>
            </div>
            {book.data ? <ChapterPipeline chapters={book.data.chapters} /> : null}
          </section>

          <div className={styles.bottom}>
            <Standings rows={data!.standings} />
            <div className={styles.sideColumn}>
              <NextProject project={data!.nextProject} />
              <Shaky items={data!.shaky} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
