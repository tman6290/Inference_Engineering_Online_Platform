import { glossaryPageSchema, type GlossaryEntry } from '@forward-pass/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { api } from '../api/client';
import { BookMarkdown } from '../features/lesson/BookMarkdown';
import { PageHeader } from '../shell/PageHeader';
import { Input } from '../ui';
import styles from './GlossaryPage.module.css';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** The letter a term files under; digits and symbols go under "#". */
const letterOf = (term: string) => {
  const first = term.normalize('NFKD').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
};

const lessonLabel = (lesson: { id: string; title: string }) =>
  lesson.id === 'preface'
    ? lesson.title
    : lesson.id === '0'
      ? `Chapter 0 · ${lesson.title}`
      : `${lesson.id} ${lesson.title}`;

function Term({ entry, highlighted }: { entry: GlossaryEntry; highlighted: boolean }) {
  return (
    <article
      id={entry.slug}
      className={[styles.term, highlighted ? styles.highlighted : ''].join(' ')}
      aria-labelledby={`${entry.slug}-name`}
    >
      <h3 id={`${entry.slug}-name`} className={styles.name}>
        {entry.term}
      </h3>
      <BookMarkdown markdown={entry.definition} className={styles.definition} />
      {entry.introducedIn || entry.usedIn.length ? (
        <p className={styles.meta}>
          {entry.introducedIn ? (
            <>
              Introduced in{' '}
              <Link to={`/book/${entry.introducedIn.id}`}>{lessonLabel(entry.introducedIn)}</Link>.
            </>
          ) : null}
          {entry.usedIn.length ? (
            <>
              {entry.introducedIn ? ' ' : ''}In the notes for{' '}
              {entry.usedIn.map((lesson, index) => (
                <span key={lesson.id}>
                  {index ? ', ' : ''}
                  <Link to={`/book/${lesson.id}`}>{lessonLabel(lesson)}</Link>
                </span>
              ))}
              .
            </>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}

export function GlossaryPage() {
  const query = useQuery({
    queryKey: ['glossary'],
    queryFn: () => api('/api/glossary', { schema: glossaryPageSchema }),
  });
  const [filter, setFilter] = useState('');
  const { hash } = useLocation();
  const target = decodeURIComponent(hash.slice(1));

  // Search results link to /glossary#slug: bring that term into view once the list renders.
  useEffect(() => {
    if (!target || !query.data) return;
    document.getElementById(target)?.scrollIntoView?.({ block: 'start' });
  }, [target, query.data]);

  const needle = filter.trim().toLowerCase();
  const terms = (query.data?.terms ?? []).filter(
    (entry) =>
      !needle ||
      entry.term.toLowerCase().includes(needle) ||
      entry.definition.toLowerCase().includes(needle),
  );
  const byLetter = new Map<string, GlossaryEntry[]>();
  for (const entry of terms) {
    const letter = letterOf(entry.term);
    byLetter.set(letter, [...(byLetter.get(letter) ?? []), entry]);
  }
  const letters = [...byLetter.keys()].sort((a, b) =>
    a === '#' ? -1 : b === '#' ? 1 : a.localeCompare(b),
  );

  return (
    <>
      <PageHeader
        eyebrow="Glossary"
        title="Glossary"
        description={
          query.data
            ? `${query.data.terms.length} terms from the book's Appendix A, each linked to the section that introduces it.`
            : undefined
        }
      />
      {query.isPending ? (
        <p role="status">Loading the glossary…</p>
      ) : query.isError ? (
        <p role="alert">Could not load the glossary. Check that the book has been ingested.</p>
      ) : query.data.terms.length === 0 ? (
        <p>
          The glossary hasn&apos;t been ingested yet. Run <code>pnpm content:ingest</code>.
        </p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.tools}>
            <Input
              label="Filter terms"
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              autoComplete="off"
            />
            <nav aria-label="Letters" className={styles.letters}>
              {LETTERS.map((letter) =>
                byLetter.has(letter) ? (
                  <a key={letter} href={`#letter-${letter}`} className={styles.letter}>
                    {letter}
                  </a>
                ) : (
                  <span
                    key={letter}
                    className={[styles.letter, styles.empty].join(' ')}
                    aria-hidden="true"
                  >
                    {letter}
                  </span>
                ),
              )}
            </nav>
            <p className={styles.count} role="status">
              {needle ? `${terms.length} of ${query.data.terms.length} terms match.` : ''}
            </p>
          </div>

          <div className={styles.list}>
            {letters.map((letter) => (
              <section key={letter} aria-labelledby={`letter-${letter}`} className={styles.group}>
                <h2 id={`letter-${letter}`} className={styles.groupLetter}>
                  {letter}
                </h2>
                {byLetter.get(letter)!.map((entry) => (
                  <Term key={entry.slug} entry={entry} highlighted={entry.slug === target} />
                ))}
              </section>
            ))}
            {terms.length === 0 ? <p>No term matches “{filter.trim()}”.</p> : null}
          </div>
        </div>
      )}
    </>
  );
}
