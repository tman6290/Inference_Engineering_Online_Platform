import type { ProjectDetail } from '@forward-pass/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { BookMarkdown } from '../features/lesson/BookMarkdown';
import { useProject, useSubmission, useSubmit } from '../features/projects/api';
import { caseStudyPath, usePortfolio, useSetVisibility } from '../features/portfolio/api';
import { CritiquePanel } from '../features/projects/CritiquePanel';
import { PageHeader } from '../shell/PageHeader';
import { Button, ButtonLink, Card, Chip, Input, LockIcon, Textarea } from '../ui';
import styles from './ProjectPage.module.css';

const errorText = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Could not reach the server. Try again.';

function SubmissionForm({ project }: { project: ProjectDetail }) {
  const submit = useSubmit(project.slug);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    submit.mutate(
      {
        body: {
          repoUrl: String(form.get('repoUrl') ?? '').trim(),
          commitSha: String(form.get('commitSha') ?? '').trim(),
          noteToGrader: String(form.get('note') ?? '').trim() || undefined,
        },
        files,
      },
      {
        onSuccess: () => {
          setFiles([]);
          (event.target as HTMLFormElement).reset();
        },
        onError: (caught) => setError(errorText(caught)),
      },
    );
  };

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <Input
        label="GitHub repository"
        name="repoUrl"
        type="url"
        required
        placeholder="https://github.com/you/repo"
        autoComplete="off"
      />
      <Input
        label="Commit (optional)"
        name="commitSha"
        hint="The full 40-character SHA. Leave it empty to check the default branch's latest commit."
        autoComplete="off"
      />
      <Textarea label="Note to the grader (optional)" name="note" rows={3} maxLength={2000} />
      <label className={styles.drop}>
        <span className={styles.dropTitle}>Charts, a PDF write-up, a notebook or a zip</span>
        <span className={styles.muted}>
          Up to 50 MB in all. The grader sees their names; the evidence belongs in the repo.
        </span>
        <input
          type="file"
          multiple
          accept=".pdf,.png,.ipynb,.zip"
          onChange={(event) => setFiles([...(event.target.files ?? [])])}
        />
        {files.length ? (
          <span className={styles.mono}>{files.map((file) => file.name).join(', ')}</span>
        ) : null}
      </label>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <div className={styles.submitRow}>
        <Button type="submit" disabled={submit.isPending || project.critiquesLeftThisHour === 0}>
          {submit.isPending ? 'Submitting…' : 'Submit for checks and critique'}
        </Button>
        <span className={styles.muted}>
          {project.critiquesLeftThisHour} of 3 critiques left this hour
        </span>
      </div>
    </form>
  );
}

/** Share link and the portfolio switch: both act on the newest portfolio-ready version. */
function PortfolioActions({ project }: { project: ProjectDetail }) {
  const portfolio = usePortfolio();
  const visibility = useSetVisibility();
  const [error, setError] = useState<string | null>(null);
  const ready = project.submissions.find(
    (submission) => submission.status === 'graded' && submission.portfolioReady,
  );
  const shown = project.submissions.find((submission) => submission.public);
  const username = portfolio.data?.username;
  const live = Boolean(portfolio.data?.pageLive && username);

  return (
    <>
      {shown && live ? (
        <ButtonLink to={caseStudyPath(username!, project.slug)} variant="ghost">
          Share link
        </ButtonLink>
      ) : (
        <Button
          variant="ghost"
          disabled
          title="Make a version public and put your page live on the Progress page to share it"
        >
          Share link
        </Button>
      )}
      {ready ? (
        <Button
          variant="secondary"
          disabled={visibility.isPending}
          onClick={() => {
            setError(null);
            visibility.mutate(
              { submissionId: ready.id, isPublic: !ready.public },
              { onError: (caught) => setError(errorText(caught)) },
            );
          }}
        >
          {ready.public
            ? `Remove v${ready.version} from portfolio`
            : `Add v${ready.version} to portfolio`}
        </Button>
      ) : (
        <Button variant="secondary" disabled title="Opens at a critique of 80 or more">
          Portfolio at 80+
        </Button>
      )}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}

function Project({ project }: { project: ProjectDetail }) {
  const [picked, setPicked] = useState<string | null>(null);
  const shownId = picked ?? project.submissions[0]?.id ?? null;
  const shown = useSubmission(shownId);
  const latest = project.submissions[0];

  return (
    <>
      <div className={styles.chips}>
        <Chip status="upNext">Solo</Chip>
        {project.unlocked ? (
          <Chip status={latest?.status === 'graded' ? 'accepted' : latest ? 'reading' : 'upNext'}>
            {latest ? `v${latest.version} · ${latest.status}` : 'Not submitted'}
          </Chip>
        ) : (
          <Chip status="queued">Locked</Chip>
        )}
        <PortfolioActions project={project} />
      </div>

      <nav aria-label="Project sections" className={styles.tabs}>
        {['Brief', 'Rubric', 'Submission', 'Critique'].map((tab) => (
          <a key={tab} href={`#${tab.toLowerCase()}`} className={styles.tab}>
            {tab}
          </a>
        ))}
      </nav>

      <div className={styles.layout}>
        <Card
          as="section"
          padding="lg"
          id="brief"
          className={styles.card}
          aria-labelledby="brief-title"
        >
          <h2 id="brief-title" className={styles.cardTitle}>
            Brief
          </h2>
          <p className={styles.mono}>
            ~{project.estimatedHours} h ·{' '}
            {project.needsGpu ? 'GPU for real numbers, CPU dry run for checks' : 'No GPU needed'} ·{' '}
            {project.skills.join(', ')}
          </p>
          <BookMarkdown markdown={project.brief} />
          <h3 className={styles.subTitle}>Deliverables</h3>
          <ul>
            {project.deliverables.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {project.constraints.length ? (
            <>
              <h3 className={styles.subTitle}>Constraints</h3>
              <ul>
                {project.constraints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className={styles.muted}>
            The grader reads{' '}
            {project.bookSections.map((section, index) => (
              <span key={section.number}>
                {index ? ', ' : ''}
                <Link to={`/book/${section.number}`}>
                  {section.number} {section.title}
                </Link>
              </span>
            ))}
            .
          </p>
        </Card>

        <Card
          as="section"
          padding="lg"
          id="rubric"
          className={styles.card}
          aria-labelledby="rubric-title"
        >
          <h2 id="rubric-title" className={styles.cardTitle}>
            Rubric
          </h2>
          <ul className={styles.rubric}>
            {project.rubric.map((row) => (
              <li key={row.dimension}>
                <span className={styles.rubricHead}>
                  <span>{row.dimension}</span>
                  <span className={styles.mono}>{row.weight}</span>
                </span>
                <ul>
                  {row.criteria.map((criterion) => (
                    <li key={criterion}>{criterion}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <h3 className={styles.subTitle}>Checks, in order</h3>
          <ol className={styles.checks}>
            {project.checks.map((check) => (
              <li key={check.id}>
                {check.label} <span className={styles.mono}>{check.kind}</span>
              </li>
            ))}
          </ol>
          <p className={styles.muted}>Required files: {project.requiredFiles.join(', ')}</p>
        </Card>

        <Card
          as="section"
          padding="lg"
          id="submission"
          className={styles.card}
          aria-labelledby="submission-title"
        >
          <h2 id="submission-title" className={styles.cardTitle}>
            Submission
          </h2>
          {project.unlocked ? (
            <SubmissionForm project={project} />
          ) : (
            <p>
              <LockIcon size={16} className={styles.lock} />
              Pass the{' '}
              <Link to={`/checkpoint/${project.unlockAfter}`}>
                {project.unlockAfter} checkpoint
              </Link>{' '}
              to open this project.
            </p>
          )}
          {project.submissions.length ? (
            <>
              <h3 className={styles.subTitle}>Your versions</h3>
              <ul className={styles.versions}>
                {project.submissions.map((submission) => (
                  <li key={submission.id}>
                    <button
                      type="button"
                      className={styles.version}
                      aria-pressed={submission.id === shownId}
                      onClick={() => setPicked(submission.id)}
                    >
                      <span>v{submission.version}</span>
                      <span className={styles.mono}>{submission.status}</span>
                      <span className={styles.mono}>{submission.total ?? '—'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {project.partner ? (
            <p className={styles.muted}>
              {project.partner.displayName} is on v{project.partner.version}
              {project.partner.total !== null ? `, scored ${project.partner.total}` : ''}. Their
              work stays private.
            </p>
          ) : null}
        </Card>

        <section id="critique" aria-labelledby="critique-title" className={styles.card}>
          <h2 id="critique-title" className={styles.cardTitle}>
            Critique
          </h2>
          {shown.data ? (
            <CritiquePanel submission={shown.data} />
          ) : (
            <p className={styles.muted}>Submit a version to see its checks and critique here.</p>
          )}
        </section>
      </div>
    </>
  );
}

export function ProjectPage() {
  const { slug = '' } = useParams();
  const query = useProject(slug);
  const data = query.data;
  return (
    <>
      <PageHeader
        eyebrow={
          data
            ? `Project ${String(data.number).padStart(2, '0')} · Chapter ${data.chapter.number} · ${data.chapter.title}`
            : 'Project'
        }
        title={data?.title ?? 'Project'}
        description={data?.summary}
      />
      {query.isPending ? (
        <p role="status">Loading the project…</p>
      ) : query.isError ? (
        <p role="alert">{errorText(query.error)}</p>
      ) : (
        <Project project={query.data} />
      )}
    </>
  );
}
