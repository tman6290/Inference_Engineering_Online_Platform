import type { BookResponse, ChapterStatus } from '@forward-pass/shared';
import { Link } from 'react-router';
import { Chip, ProgressBar, type ChipStatus } from '../../ui';
import styles from './ChapterPipeline.module.css';

type Chapter = BookResponse['chapters'][number];

const statusChip: Record<ChapterStatus, { chip: ChipStatus; label: string }> = {
  done: { chip: 'done', label: 'Done' },
  reading: { chip: 'reading', label: 'Reading' },
  upNext: { chip: 'upNext', label: 'Up next' },
  queued: { chip: 'queued', label: 'Queued' },
};

/** Where a chapter card leads: its first unread section, or its first section. */
export function chapterLink(chapter: Chapter): string {
  if (chapter.number === 0) return '/book/0';
  const next =
    chapter.sections.find((section) => section.readState !== 'read') ?? chapter.sections[0];
  return next ? `/book/${next.number}` : '/book';
}

/** The book as a pipeline, as on the Home board: one card per chapter, the current one dark. */
export function ChapterPipeline({ chapters }: { chapters: Chapter[] }) {
  return (
    <ol className={styles.pipeline}>
      {chapters.map((chapter) => {
        const status = statusChip[chapter.status];
        const count = chapter.sections.length;
        return (
          <li key={chapter.number}>
            <Link
              to={chapterLink(chapter)}
              className={[styles.card, styles[chapter.status]].join(' ')}
              data-surface={chapter.status === 'reading' ? 'dark' : undefined}
            >
              <span className={styles.top}>
                <span className={styles.meta}>
                  Ch {chapter.number}
                  {count ? ` · ${count} sections` : ''}
                </span>
                <Chip status={status.chip}>{status.label}</Chip>
              </span>
              <span className={styles.title}>{chapter.title}</span>
              <span className={styles.summary}>{chapter.summary}</span>
              <ProgressBar
                value={chapter.progressPct}
                label={`Chapter ${chapter.number}: ${chapter.progressPct}% read`}
                hideLabel
                className={styles.bar}
              />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
