import { SECTION_COUNT, STUDY_TIMEZONE, healthResponseSchema } from '@forward-pass/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { useAuth } from '../auth/auth';
import { Chip } from '../ui';
import { Placeholder } from './Placeholder';
import styles from './Placeholder.module.css';

async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return healthResponseSchema.parse(await res.json());
}

/** Morning, afternoon or evening in the pod's timezone. */
export function greeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: STUDY_TIMEZONE,
    }).format(now),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomePage() {
  const { me } = useAuth();
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });
  return (
    <Placeholder
      eyebrow="Home"
      title={me ? `${greeting()}, ${me.user.displayName}.` : `${greeting()}.`}
      description={`Decode progress across ${SECTION_COUNT} sections, the pod standings and the next project will live here.`}
      plan={[
        'Continue decoding: the section you stopped at',
        'Decode progress, acceptance rate, projects shipped, time this week',
        'The book as a pipeline: eight chapters at a glance',
        'Pod standings, the next project and shaky concepts',
      ]}
    >
      <p className={styles.status} role="status">
        {health.isPending ? (
          <Chip status="upNext">API checking</Chip>
        ) : health.isSuccess ? (
          <Chip status="accepted">API online</Chip>
        ) : (
          <Chip status="retry">API offline</Chip>
        )}
      </p>
    </Placeholder>
  );
}

export function ProjectsPage() {
  return (
    <Placeholder
      eyebrow="Projects"
      title="Projects"
      description="Seven solo deliverables, one per chapter. Graded by checks and a critique."
      plan={['Project list with lock state and scores', 'Portfolio flags']}
    />
  );
}

export function ProjectPage() {
  const { slug = '' } = useParams();
  return (
    <Placeholder
      eyebrow={`Project ${slug}`}
      title="Project brief"
      description="The brief, your submission and the critique."
      plan={['Brief and rubric', 'Repo URL and file upload', 'Check results and critique']}
    />
  );
}

export function ProgressPage() {
  return (
    <Placeholder
      eyebrow="Progress"
      title="Progress"
      description="Mastery by section and your portfolio."
      plan={['Decode progress and acceptance rate over time', 'Confidence by section', 'Portfolio']}
    />
  );
}

export function GlossaryPage() {
  return (
    <Placeholder
      eyebrow="Glossary"
      title="Glossary"
      description="Every term the book defines, linked to the section that introduces it."
      plan={['Search across terms', 'Definitions with section links']}
    />
  );
}

export function NotFoundPage() {
  return (
    <Placeholder
      eyebrow="404"
      title="Page not found"
      description="That address doesn't match a page."
      plan={['Use the navigation to get back on track']}
    />
  );
}
