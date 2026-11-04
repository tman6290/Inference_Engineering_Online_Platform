import type { CaseStudy, PublicProfile } from '@forward-pass/shared';
import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { caseStudyPath, useCaseStudy, usePublicProfile } from '../features/portfolio/api';
import { ThemeToggle } from '../shell/ThemeToggle';
import { Card, Chip, Eyebrow, LogoMark, ProgressBar } from '../ui';
import styles from './PublicPages.module.css';

// The opt-in public layer: no sign-in, no app shell. Only what the owner made public is here.

const two = (n: number) => String(n).padStart(2, '0');
const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.brand}>
          <span className={styles.logoTile}>
            <LogoMark size={20} />
          </span>
          <span className={styles.brandText}>
            Forward Pass <span className={styles.sub}>· Inference Engineering</span>
          </span>
        </span>
        <ThemeToggle />
      </header>
      <main id="main" className={styles.main}>
        {children}
      </main>
    </div>
  );
}

function Missing({ error }: { error: unknown }) {
  const notFound = error instanceof ApiRequestError && error.status === 404;
  return (
    <section className={styles.missing} aria-labelledby="missing-title">
      <h1 id="missing-title" className={styles.title}>
        {notFound ? 'No public page here' : 'Something went wrong'}
      </h1>
      <p role="alert" className={styles.muted}>
        {notFound
          ? 'This page is private or does not exist.'
          : 'Could not load the page. Try again in a moment.'}
      </p>
    </section>
  );
}

function useTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · Forward Pass`;
  }, [title]);
}

function Profile({ profile }: { profile: PublicProfile }) {
  useTitle(profile.displayName);
  return (
    <>
      <Eyebrow>Portfolio · /p/{profile.username}</Eyebrow>
      <h1 className={styles.title}>{profile.displayName}</h1>
      <p className={styles.lede}>
        Working through <cite>Inference Engineering</cite> by Philip Kiely, one chapter and one solo
        project at a time.
      </p>

      <dl className={styles.stats}>
        <div>
          <dt>Chapters complete</dt>
          <dd>
            {profile.chaptersComplete}
            <span className={styles.of}>/{profile.chaptersTotal}</span>
          </dd>
        </div>
        <div>
          <dt>Acceptance rate</dt>
          <dd>{pct(profile.acceptanceRate)}</dd>
        </div>
        <div>
          <dt>Public projects</dt>
          <dd>{profile.projects.length}</dd>
        </div>
      </dl>

      {profile.skills.length ? (
        <section className={styles.block} aria-labelledby="skills-title">
          <h2 id="skills-title" className={styles.heading}>
            Skills on record
          </h2>
          <ul className={styles.chips}>
            {profile.skills.map((skill) => (
              <li key={skill}>
                <Chip status="public">{skill}</Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="projects-title">
        <h2 id="projects-title" className={styles.heading}>
          Projects
        </h2>
        {profile.projects.length ? (
          <ul className={styles.projects}>
            {profile.projects.map((project) => (
              <Card as="li" key={project.slug} padding="lg" className={styles.project}>
                <Eyebrow>
                  Project {two(project.number)} · Chapter {project.chapterNumber}
                </Eyebrow>
                <h3 className={styles.projectTitle}>
                  <Link to={caseStudyPath(profile.username, project.slug)} className={styles.link}>
                    {project.title}
                  </Link>
                </h3>
                {project.decision ? <p>{project.decision}</p> : null}
                <p className={styles.score}>
                  {project.total}
                  <span className={styles.of}>/100</span>
                </p>
              </Card>
            ))}
          </ul>
        ) : (
          <p className={styles.muted}>No public case studies yet.</p>
        )}
      </section>
    </>
  );
}

function Study({ study }: { study: CaseStudy }) {
  useTitle(`${study.title} · ${study.displayName}`);
  return (
    <>
      <p className={styles.back}>
        <Link to={`/p/${encodeURIComponent(study.username)}`}>{study.displayName}</Link>
      </p>
      <Eyebrow>
        Project {two(study.number)} · Chapter {study.chapter.number} · {study.chapter.title}
      </Eyebrow>
      <h1 className={styles.title}>{study.title}</h1>
      {study.decision ? <p className={styles.lede}>{study.decision}</p> : null}

      <Card as="section" variant="dark" padding="lg" className={styles.verdict} aria-label="Score">
        <p className={styles.bigScore}>
          {study.total}
          <span className={styles.of}>/100</span>
        </p>
        <ul className={styles.dimensions}>
          {study.dimensions.map((dimension) => (
            <li key={dimension.dimension}>
              <ProgressBar
                value={(dimension.score / dimension.max) * 100}
                label={dimension.dimension}
                valueText={`${dimension.score}/${dimension.max}`}
              />
            </li>
          ))}
        </ul>
      </Card>

      {study.charts.length ? (
        <section className={styles.block} aria-labelledby="charts-title">
          <h2 id="charts-title" className={styles.heading}>
            Charts
          </h2>
          <div className={styles.charts}>
            {study.charts.map((chart) => (
              <figure key={chart.name} className={styles.chart}>
                <img src={chart.url} alt={`Chart: ${chart.name}`} loading="lazy" />
                <figcaption className={styles.caption}>{chart.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {study.right.length ? (
        <section className={styles.block} aria-labelledby="right-title">
          <h2 id="right-title" className={styles.heading}>
            What the critique found right
          </h2>
          <ul className={styles.list}>
            {study.right.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {study.skillsDemonstrated.length ? (
        <section className={styles.block} aria-labelledby="study-skills-title">
          <h2 id="study-skills-title" className={styles.heading}>
            Skills demonstrated
          </h2>
          <ul className={styles.chips}>
            {study.skillsDemonstrated.map((skill) => (
              <li key={skill}>
                <Chip status="public">{skill}</Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className={styles.foot}>
        Version {study.version}
        {study.commitSha ? ` · commit ${study.commitSha.slice(0, 7)}` : ''} ·{' '}
        <a href={study.repoUrl} rel="noopener noreferrer">
          Repository on GitHub
        </a>
      </p>
    </>
  );
}

export function PublicProfilePage() {
  const { username = '' } = useParams();
  const query = usePublicProfile(username);
  return (
    <PublicLayout>
      {query.isPending ? (
        <p role="status">Loading…</p>
      ) : query.isError ? (
        <Missing error={query.error} />
      ) : (
        <Profile profile={query.data} />
      )}
    </PublicLayout>
  );
}

export function CaseStudyPage() {
  const { username = '', slug = '' } = useParams();
  const query = useCaseStudy(username, slug);
  return (
    <PublicLayout>
      {query.isPending ? (
        <p role="status">Loading…</p>
      ) : query.isError ? (
        <Missing error={query.error} />
      ) : (
        <Study study={query.data} />
      )}
    </PublicLayout>
  );
}
