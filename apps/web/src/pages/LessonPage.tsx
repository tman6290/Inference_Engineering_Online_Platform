import type { LessonResponse } from '@forward-pass/shared';
import { useId, useState } from 'react';
import { useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useLesson, useReadingEvent } from '../features/lesson/api';
import { BookMarkdown } from '../features/lesson/BookMarkdown';
import { DigestView } from '../features/lesson/DigestView';
import { LessonFooter } from '../features/lesson/LessonFooter';
import { LessonOutline } from '../features/lesson/LessonOutline';
import { LessonRail, type OnThisPageItem } from '../features/lesson/LessonRail';
import { SubsectionReader } from '../features/lesson/SubsectionReader';
import { useReadingTracker } from '../features/lesson/useReadingTracker';
import { ButtonLink, Eyebrow } from '../ui';
import styles from './LessonPage.module.css';

/** "CH 5 · TECHNIQUES / 5.2", "CHAPTER 0", or "START HERE". */
function crumb(lesson: LessonResponse): string {
  if (!lesson.chapter) return 'Start here';
  if (lesson.kind === 'chapter') return `Chapter ${lesson.chapter.number}`;
  return `Ch ${lesson.chapter.number} · ${lesson.chapter.title} / ${lesson.number}`;
}

function metaLine(lesson: LessonResponse): string {
  const parts = [`${lesson.readingMinutes} min`];
  if (lesson.subsections.length) {
    parts.push(
      `${lesson.subsections.length} ${lesson.subsections.length === 1 ? 'subsection' : 'subsections'}`,
    );
  }
  if (lesson.hasCheckpoint) parts.push('1 checkpoint');
  return parts.join(' · ');
}

function onThisPage(lesson: LessonResponse): OnThisPageItem[] {
  const digest = lesson.digest;
  const items: OnThisPageItem[] = [];
  if (digest) {
    items.push({ id: 'mechanism', label: 'The mechanism' });
    if (lesson.figures.length && digest.figureRefs.length)
      items.push({ id: 'figures', label: 'Figures' });
    items.push({ id: 'key-ideas', label: 'What to hold onto' });
    if (digest.workedExample) items.push({ id: 'worked-example', label: 'Worked example' });
    items.push({ id: 'check-yourself', label: 'Check yourself' });
    if (digest.reflect) items.push({ id: 'reflect', label: 'Explain it' });
    if (lesson.subsections.length) items.push({ id: 'read-the-book', label: 'Read the book' });
  } else {
    items.push({ id: 'book-text', label: 'The book' });
    for (const sub of lesson.subsections)
      items.push({ id: `sub-${sub.number}`, label: `${sub.number} ${sub.title}` });
  }
  return items;
}

function Lesson({ lesson }: { lesson: LessonResponse }) {
  const reading = useReadingEvent(lesson.id);
  useReadingTracker(lesson.id, (event) => reading.mutate(event), lesson.progress.maxScrollPct);
  const introFigures = lesson.figures.filter((figure) => !figure.subsectionNumber);
  // One outline for every width; below 900px it folds behind a toggle.
  const [outlineOpen, setOutlineOpen] = useState(false);
  const outlineId = useId();

  return (
    <div className={styles.layout}>
      <div className={styles.outline}>
        <button
          type="button"
          className={styles.outlineToggle}
          aria-expanded={outlineOpen}
          aria-controls={outlineId}
          onClick={() => setOutlineOpen((open) => !open)}
        >
          {lesson.chapter
            ? `Chapter ${lesson.chapter.number} · ${lesson.chapter.title}`
            : 'Lessons'}
        </button>
        <div id={outlineId} className={outlineOpen ? undefined : styles.outlineFolded}>
          <LessonOutline lesson={lesson} />
        </div>
      </div>

      <article className={styles.content} aria-labelledby="lesson-title">
        <header className={styles.header}>
          <div className={styles.metaRow}>
            <Eyebrow>{crumb(lesson)}</Eyebrow>
            <Eyebrow>{metaLine(lesson)}</Eyebrow>
          </div>
          <h1 id="lesson-title" className={styles.title}>
            {lesson.title}
          </h1>
          <p className={styles.subtitle}>{lesson.summary}</p>
        </header>

        {lesson.digest ? (
          <>
            <DigestView lesson={lesson} digest={lesson.digest} />
            <SubsectionReader
              subsections={lesson.subsections}
              cards={lesson.digest.subsectionCards}
              figures={lesson.figures}
            />
            {lesson.subsections.length === 0 && lesson.intro ? (
              <details className={styles.fullText}>
                <summary>Read the book text</summary>
                <BookMarkdown markdown={lesson.intro} figures={introFigures} />
              </details>
            ) : null}
          </>
        ) : (
          // No authored digest yet: the ingested book text, with its figures inline.
          <section id="book-text" aria-label="The book" className={styles.bookText}>
            <p className={styles.fallbackNote}>
              Notes for this lesson aren&apos;t written yet, so here is the book text.
            </p>
            <BookMarkdown markdown={lesson.intro} figures={introFigures} />
            {lesson.subsections.map((sub) => (
              <section
                key={sub.number}
                id={`sub-${sub.number}`}
                className={styles.bookSubsection}
                aria-labelledby={`sub-title-${sub.number}`}
              >
                <h2 id={`sub-title-${sub.number}`} className={styles.subsectionTitle}>
                  {sub.number} {sub.title}
                </h2>
                <BookMarkdown
                  markdown={sub.markdown}
                  figures={lesson.figures.filter(
                    (figure) => figure.subsectionNumber === sub.number,
                  )}
                />
              </section>
            ))}
          </section>
        )}

        <LessonFooter lesson={lesson} />
      </article>

      <div className={styles.rail}>
        <LessonRail lesson={lesson} sections={onThisPage(lesson)} />
      </div>
    </div>
  );
}

export function LessonPage() {
  const { sectionId = '' } = useParams();
  const query = useLesson(sectionId);

  if (query.isPending) {
    return (
      <p className={styles.status} role="status">
        Loading the lesson…
      </p>
    );
  }
  if (query.isError) {
    const notFound =
      query.error instanceof ApiRequestError && [400, 404].includes(query.error.status);
    return (
      <div className={styles.status}>
        <h1 className={styles.title}>
          {notFound ? 'No such lesson' : 'Could not load the lesson'}
        </h1>
        <p className={styles.subtitle}>
          {notFound
            ? `There is no lesson "${sectionId}". Pick one from the table of contents.`
            : 'Check that the API is running and the book has been ingested (pnpm content:ingest).'}
        </p>
        <ButtonLink to="/book" variant="secondary">
          Table of contents
        </ButtonLink>
      </div>
    );
  }
  return <Lesson key={query.data.id} lesson={query.data} />;
}
