import type { LessonResponse } from '@forward-pass/shared';
import { Link } from 'react-router';
import {
  ArrowLeftIcon,
  CircleCheckIcon,
  CircleDotIcon,
  CircleIcon,
  Eyebrow,
  LockIcon,
  ProgressBar,
} from '../../ui';
import styles from './LessonOutline.module.css';

interface LessonOutlineProps {
  lesson: LessonResponse;
}

const stateWords = { read: 'read', reading: 'in progress', unread: 'not started' } as const;

/** The chapter's sections with read state; the current one opens to its subsections. */
export function LessonOutline({ lesson }: LessonOutlineProps) {
  const chapter = lesson.chapter;
  const lessons = chapter?.lessons ?? [
    { id: lesson.id, title: lesson.title, readState: lesson.progress.readState, subsections: [] },
  ];
  const read = lessons.filter((entry) => entry.readState === 'read').length;

  return (
    <nav
      className={styles.outline}
      aria-label={chapter ? `Chapter ${chapter.number} outline` : 'Lesson outline'}
    >
      <Link to="/book" className={styles.back}>
        <ArrowLeftIcon size={16} />
        All chapters
      </Link>
      <div className={styles.head}>
        <Eyebrow>{chapter ? `Chapter ${chapter.number}` : 'Start here'}</Eyebrow>
        <p className={styles.title}>{chapter ? chapter.title : 'Preface'}</p>
        {chapter ? <p className={styles.summary}>{chapter.summary}</p> : null}
        <ProgressBar
          value={lessons.length ? (read / lessons.length) * 100 : 0}
          label={`${read} of ${lessons.length} read`}
          hideLabel
          className={styles.progress}
        />
      </div>

      <ol className={styles.list}>
        {lessons.map((entry) => {
          const current = entry.id === lesson.id;
          const Icon =
            entry.readState === 'read' ? CircleCheckIcon : current ? CircleDotIcon : CircleIcon;
          const label =
            entry.id === '0' || entry.id === 'preface' ? entry.title : `${entry.id} ${entry.title}`;
          return (
            <li key={entry.id}>
              <Link
                to={`/book/${entry.id}`}
                aria-current={current ? 'page' : undefined}
                className={[
                  styles.lesson,
                  current ? styles.current : '',
                  styles[entry.readState],
                ].join(' ')}
              >
                <Icon size={18} className={styles.icon} />
                <span className={styles.lessonTitle}>{label}</span>
                <span className="visually-hidden">, {stateWords[entry.readState]}</span>
              </Link>
              {current && (entry.subsections.length > 0 || lesson.hasCheckpoint) ? (
                <ol className={styles.subsections}>
                  {entry.subsections.map((sub) => (
                    <li key={sub.number}>
                      <a href={`#sub-${sub.number}`} className={styles.subsection}>
                        {sub.number} {sub.title}
                      </a>
                    </li>
                  ))}
                  {lesson.hasCheckpoint ? (
                    <li>
                      <Link to={`/checkpoint/${lesson.id}`} className={styles.subsection}>
                        Checkpoint · 10 q
                      </Link>
                    </li>
                  ) : null}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>

      {chapter && chapter.number > 0 ? (
        <p className={styles.project}>
          <LockIcon size={18} />
          <span>Chapter {chapter.number} project · unlocks after the checkpoints</span>
        </p>
      ) : null}
    </nav>
  );
}
