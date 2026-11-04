import type { ProjectCard, SubmissionSummary } from '@forward-pass/shared';
import { Link } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useProjects } from '../features/projects/api';
import { PageHeader } from '../shell/PageHeader';
import { Card, Chip, Eyebrow, LockIcon } from '../ui';
import styles from './ProjectsPage.module.css';

const two = (n: number) => String(n).padStart(2, '0');

function StatusChip({ project }: { project: ProjectCard }) {
  if (!project.unlocked) return <Chip status="queued">Locked</Chip>;
  const mine: SubmissionSummary | null = project.mine;
  if (!mine) return <Chip status="upNext">Not submitted</Chip>;
  if (mine.status === 'graded') {
    return mine.portfolioReady ? (
      <Chip status="public">Portfolio-ready</Chip>
    ) : (
      <Chip status="accepted">Graded</Chip>
    );
  }
  if (mine.status === 'failed') return <Chip status="retry">Failed</Chip>;
  return <Chip status="reading">{mine.status === 'queued' ? 'Queued' : 'Grading'}</Chip>;
}

function ProjectTile({ project }: { project: ProjectCard }) {
  const titleId = `project-${project.slug}`;
  const score = project.mine?.total ?? null;
  return (
    <Card
      as="li"
      padding="lg"
      variant={project.unlocked ? 'paper' : 'dashed'}
      className={styles.card}
      aria-labelledby={titleId}
    >
      <div className={styles.top}>
        <Eyebrow>
          Project {two(project.number)} · Chapter {project.chapter.number}
        </Eyebrow>
        <StatusChip project={project} />
      </div>
      <h2 id={titleId} className={styles.title}>
        {!project.unlocked ? <LockIcon size={18} className={styles.lock} /> : null}
        <Link to={`/projects/${project.slug}`} className={styles.link}>
          {project.title}
        </Link>
      </h2>
      <p className={styles.summary}>{project.summary}</p>
      <p className={styles.meta}>
        ~{project.estimatedHours} h · {project.needsGpu ? 'GPU for real numbers' : 'CPU only'}
      </p>

      <dl className={styles.facts}>
        <div>
          <dt>Your score</dt>
          <dd className={styles.score}>
            {score !== null ? (
              <>
                {score}
                <span className={styles.outOf}>/100</span>
              </>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>{project.unlocked ? 'Latest' : 'Opens'}</dt>
          <dd>
            {project.unlocked
              ? project.mine
                ? `v${project.mine.version}`
                : 'No version yet'
              : `after the ${project.unlockAfter} checkpoint`}
          </dd>
        </div>
      </dl>

      {project.partner ? (
        <p className={styles.partner}>
          {project.partner.displayName}: v{project.partner.version}
          {project.partner.total !== null ? `, ${project.partner.total}/100` : ', not graded yet'}
        </p>
      ) : null}
    </Card>
  );
}

export function ProjectsPage() {
  const query = useProjects();
  const projects = query.data?.projects ?? [];
  const graded = projects.filter((project) => project.mine?.status === 'graded').length;

  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Projects"
        description="Seven solo deliverables, one per chapter. Each opens when you pass its chapter's last checkpoint, and is graded by checks and a critique."
      />
      {query.isPending ? (
        <p role="status">Loading projects…</p>
      ) : query.isError ? (
        <p role="alert">
          {query.error instanceof ApiRequestError
            ? query.error.message
            : 'Could not load projects. Check that the API is running.'}
        </p>
      ) : (
        <>
          <p className={styles.count}>
            {graded} of {projects.length} graded
          </p>
          <ul className={styles.grid} aria-label="Projects">
            {projects.map((project) => (
              <ProjectTile key={project.slug} project={project} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
