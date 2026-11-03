import type { GlossaryEntry } from '@forward-pass/shared';
import { slugify } from '../book/parse';
import type { LoadedContent } from '../content/load';
import type { Db } from '../db';
import { readingOrder } from '../lessons/progress';
import type { SearchDoc } from './index';

const clip = (text: string, length = 110) =>
  text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;

/** Plain text for subtitles: drops Markdown emphasis, links and code marks. */
const plain = (markdown: string) =>
  markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Lessons whose digests list each glossary slug, in reading order. */
async function usage(db: Db, content: LoadedContent) {
  const order = await readingOrder(db);
  const bySlug = new Map<string, { id: string; title: string }[]>();
  for (const lesson of order) {
    const digest = content.digests.get(lesson.id);
    for (const term of digest?.terms ?? []) {
      const slug = slugify(term);
      bySlug.set(slug, [...(bySlug.get(slug) ?? []), lesson]);
    }
  }
  return { order, bySlug };
}

/** Every glossary term with the section that introduces it and the lessons whose notes use it. */
export async function glossaryEntries(
  db: Db,
  content: LoadedContent,
  where?: { q: string },
): Promise<GlossaryEntry[]> {
  const [terms, { order, bySlug }] = await Promise.all([
    db.glossaryTerm.findMany({
      where: where?.q
        ? {
            OR: [
              { term: { contains: where.q, mode: 'insensitive' } },
              { definition: { contains: where.q, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { term: 'asc' },
    }),
    usage(db, content),
  ]);
  return terms.map((term) => {
    const section = term.sectionNumber
      ? order.find((lesson) => lesson.id === term.sectionNumber)
      : undefined;
    return {
      term: term.term,
      slug: term.slug,
      definition: term.definition,
      sectionNumber: term.sectionNumber,
      introducedIn: section ? { id: section.id, title: section.title } : null,
      usedIn: bySlug.get(term.slug) ?? [],
    };
  });
}

/** The search documents: lessons (with their notes' one-liners), glossary terms and exercises. */
export async function searchDocs(db: Db, content: LoadedContent): Promise<SearchDoc[]> {
  const [order, sections, terms] = await Promise.all([
    readingOrder(db),
    db.section.findMany({ select: { number: true, summary: true } }),
    db.glossaryTerm.findMany(),
  ]);
  const summaries = new Map(sections.map((section) => [section.number, section.summary]));

  const lessons: SearchDoc[] = order.map((lesson) => {
    const digest = content.digests.get(lesson.id);
    const label =
      lesson.id === 'preface'
        ? lesson.title
        : lesson.id === '0'
          ? `Chapter 0 · ${lesson.title}`
          : `${lesson.id} ${lesson.title}`;
    const summary = summaries.get(lesson.id) ?? '';
    return {
      type: 'section',
      id: lesson.id,
      title: label,
      subtitle: clip(plain(digest?.oneLine ?? summary)),
      href: `/book/${lesson.id}`,
      body: [digest?.oneLine ?? '', summary, ...(digest?.terms ?? [])].join(' '),
    };
  });

  const glossary: SearchDoc[] = terms.map((term) => ({
    type: 'term',
    id: term.slug,
    title: term.term,
    subtitle: clip(plain(term.definition)),
    href: `/glossary#${term.slug}`,
    body: term.definition,
  }));

  const exercises: SearchDoc[] = [...content.exercises.values()].map(({ exercise }) => {
    const lesson = order.find((entry) => entry.id === exercise.sectionNumber);
    return {
      type: 'exercise',
      id: exercise.id,
      title: exercise.title,
      subtitle: `${exercise.sectionNumber}${lesson ? ` ${lesson.title}` : ''} · ${exercise.estimatedMinutes} min`,
      href: `/book/${exercise.sectionNumber}/exercises/${exercise.id}`,
      body: '',
    };
  });

  return [...lessons, ...glossary, ...exercises];
}
