import { SECTION_COUNT, type BookResponse, type ReadState } from '@forward-pass/shared';
import { Link } from 'react-router';
import { ChapterPipeline } from '../features/book/ChapterPipeline';
import { useBook } from '../features/lesson/api';
import { PageHeader } from '../shell/PageHeader';
import { CircleCheckIcon, CircleDotIcon, CircleIcon } from '../ui';
import styles from './BookPage.module.css';

const stateIcon: Record<ReadState, typeof CircleIcon> = {
  read: CircleCheckIcon,
  reading: CircleDotIcon,
  unread: CircleIcon,
};
const stateWords: Record<ReadState, string> = {
  read: 'Read',
  reading: 'In progress',
  unread: 'Not started',
};
const confidenceWords = { shaky: 'Shaky', okay: 'Okay', solid: 'Solid' } as const;

function LessonRow({
  to,
  label,
  minutes,
  readState,
  confidence,
  score,
}: {
  to: string;
  label: string;
  minutes?: number;
  readState: ReadState;
  confidence?: keyof typeof confidenceWords | null;
  score?: number | null;
}) {
  const Icon = stateIcon[readState];
  return (
    <li>
      <Link to={to} className={[styles.row, styles[readState]].join(' ')}>
        <Icon size={18} className={styles.icon} />
        <span className={styles.rowTitle}>{label}</span>
        <span className={styles.rowMeta}>
          <span className="visually-hidden">Status: </span>
          {stateWords[readState]}
          {confidence ? ` · ${confidenceWords[confidence]}` : ''}
          {minutes ? ` · ${minutes} min` : ''}
          {score === undefined
            ? ''
            : ` · checkpoint ${score === null ? '—' : `${Math.round(score * 100)}%`}`}
        </span>
      </Link>
    </li>
  );
}

function Contents({ book }: { book: BookResponse }) {
  const chapterZero = book.chapters.find((chapter) => chapter.number === 0);
  const numbered = book.chapters.filter((chapter) => chapter.number > 0);

  return (
    <>
      <ChapterPipeline chapters={book.chapters} />

      <section className={styles.part} aria-labelledby="start-here">
        <h2 id="start-here" className={styles.partTitle}>
          Start here
        </h2>
        <ul className={styles.rows}>
          {book.frontMatter.map((page) => (
            <LessonRow
              key={page.slug}
              to={`/book/${page.slug}`}
              label={page.title}
              readState={page.readState}
            />
          ))}
          {chapterZero ? (
            <LessonRow
              to="/book/0"
              label={`Chapter 0 · ${chapterZero.title}`}
              readState={chapterZero.readState}
            />
          ) : null}
        </ul>
      </section>

      {numbered.map((chapter) => (
        <section
          key={chapter.number}
          className={styles.part}
          aria-labelledby={`chapter-${chapter.number}`}
        >
          <div className={styles.partHead}>
            <h2 id={`chapter-${chapter.number}`} className={styles.partTitle}>
              Chapter {chapter.number} · {chapter.title}
            </h2>
            <p className={styles.partSummary}>{chapter.summary}</p>
          </div>
          <ul className={styles.rows}>
            {chapter.sections.map((section) => (
              <LessonRow
                key={section.number}
                to={`/book/${section.number}`}
                label={`${section.number} ${section.title}`}
                minutes={section.readingMinutes}
                readState={section.readState}
                confidence={section.confidence}
                score={section.checkpointScore}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export function BookPage() {
  const book = useBook();
  return (
    <>
      <PageHeader
        eyebrow="The Book"
        title="Table of contents"
        description={
          book.data
            ? `Eight chapters, ${SECTION_COUNT} sections, seven projects. ${book.data.decoded} of ${SECTION_COUNT} sections decoded.`
            : `Eight chapters, ${SECTION_COUNT} sections, seven projects. Read in order; the stack builds bottom-up.`
        }
      />
      {book.isPending ? (
        <p role="status">Loading the book…</p>
      ) : book.isError ? (
        <p role="alert">
          Could not load the book. Check that the API is running and the book has been ingested.
        </p>
      ) : book.data.chapters.length === 0 ? (
        <p>
          The book hasn&apos;t been ingested yet. Run <code>pnpm content:ingest</code>.
        </p>
      ) : (
        <Contents book={book.data} />
      )}
    </>
  );
}
