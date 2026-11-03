import { STUDY_TIMEZONE } from '@forward-pass/shared';
import { useParams } from 'react-router';
import { Placeholder } from './Placeholder';

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
