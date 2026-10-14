import { SECTION_COUNT, healthResponseSchema } from '@forward-pass/shared';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { ButtonLink, Chip } from '../ui';
import { Placeholder } from './Placeholder';
import styles from './Placeholder.module.css';

async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return healthResponseSchema.parse(await res.json());
}

export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });
  return (
    <Placeholder
      eyebrow="Home"
      title="Good morning."
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

export function BookPage() {
  return (
    <Placeholder
      eyebrow="The Book"
      title="Table of contents"
      description="Eight chapters, 42 sections, seven projects. Read in order; the stack builds bottom-up."
      plan={['Chapters with section lists and read state', 'Project unlock points']}
    />
  );
}

export function SectionPage() {
  const { sectionId = '' } = useParams();
  return (
    <Placeholder
      eyebrow={`Section ${sectionId}`}
      title="Lesson"
      description="The section text, worked examples, terms on the page and your notes."
      plan={[
        'Chapter outline with subsection progress',
        'Reading column with figures and check-yourself questions',
        'Confidence rating and the link to the checkpoint',
      ]}
    >
      <ButtonLink to={`/checkpoint/${sectionId}`} variant="secondary" arrow className={styles.cta}>
        Go to the checkpoint
      </ButtonLink>
    </Placeholder>
  );
}

export function CheckpointsPage() {
  return (
    <Placeholder
      eyebrow="Checkpoints"
      title="Checkpoints"
      description="Ten questions per section, drawn from a bank of at least twenty."
      plan={['Checkpoint history by section', 'Recall queue for spaced repetition', 'Open duels']}
    />
  );
}

export function CheckpointPage() {
  const { sectionId = '' } = useParams();
  return (
    <Placeholder
      eyebrow={`Checkpoint ${sectionId}`}
      title="Checkpoint"
      description="Scenario, calculation and short-answer questions on this section."
      plan={[
        'Segmented progress across ten questions',
        'Answer options with accepted and retry states',
        'Feedback that cites the section to re-read',
      ]}
    />
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
