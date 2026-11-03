import type { LessonResponse } from '@forward-pass/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Eyebrow, Textarea } from '../../ui';
import { TeachBack } from '../pod/TeachBack';
import { useSaveNote } from './api';
import styles from './LessonRail.module.css';

export interface OnThisPageItem {
  id: string;
  label: string;
}

interface LessonRailProps {
  lesson: LessonResponse;
  sections: OnThisPageItem[];
}

const NOTE_SAVE_DELAY_MS = 800;

/** Marks each on-page section once it has scrolled into view. */
function useVisited(ids: string[]): Set<string> {
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => entry.target.id);
        if (seen.length) setVisited((current) => new Set([...current, ...seen]));
      },
      { rootMargin: '0px 0px -40% 0px' },
    );
    for (const id of key.split('|')) {
      const element = id ? document.getElementById(id) : null;
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [key]);
  return visited;
}

function NoteEditor({ lesson }: { lesson: LessonResponse }) {
  const save = useSaveNote(lesson.id);
  const [body, setBody] = useState(lesson.note?.body ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    lesson.note ? 'saved' : 'idle',
  );
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(body);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (value: string) => {
    setBody(value);
    latest.current = value;
    setStatus('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save.mutate(latest.current, {
        onSuccess: () => setStatus('saved'),
        onError: () => setStatus('error'),
      });
    }, NOTE_SAVE_DELAY_MS);
  };

  const caption = {
    idle: 'Saved automatically · shared with your pod',
    saving: 'Saving…',
    saved: 'Saved · shared with your pod',
    error: 'Could not save. Keep typing to retry.',
  }[status];

  return (
    <div className={styles.block}>
      <Textarea
        label="Your notes"
        value={body}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        placeholder="What clicked, what didn't, what to try in the project…"
        hint={<span aria-live="polite">{caption}</span>}
      />
    </div>
  );
}

export function LessonRail({ lesson, sections }: LessonRailProps) {
  const visited = useVisited(sections.map((section) => section.id));
  const [showPartnerNote, setShowPartnerNote] = useState(false);
  const partner = lesson.partner;
  const partnerActivity = partner
    ? [
        partner.confidence
          ? `rated this ${partner.confidence[0]!.toUpperCase()}${partner.confidence.slice(1)}`
          : null,
        partner.note ? 'left a note' : null,
      ].filter(Boolean)
    : [];

  return (
    <aside className={styles.rail} aria-label="About this lesson">
      {sections.length ? (
        <nav className={styles.block} aria-labelledby="on-this-page">
          <Eyebrow as="h2" id="on-this-page">
            On this page
          </Eyebrow>
          <ol className={styles.toc}>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={styles.tocLink}>
                  <span
                    className={[styles.dot, visited.has(section.id) ? styles.dotSeen : ''].join(
                      ' ',
                    )}
                    aria-hidden="true"
                  />
                  {section.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {lesson.terms.length ? (
        <section className={styles.block} aria-labelledby="terms-on-page">
          <Eyebrow as="h2" id="terms-on-page">
            Terms on this page
          </Eyebrow>
          <dl className={styles.terms}>
            {lesson.terms.map((term) => (
              <div key={term.slug} className={styles.term}>
                <dt className={styles.termName}>{term.term}</dt>
                <dd className={styles.termDefinition}>{term.definition}</dd>
              </div>
            ))}
          </dl>
          <Link to="/glossary" className={styles.more}>
            Full glossary
          </Link>
        </section>
      ) : null}

      <NoteEditor key={lesson.id} lesson={lesson} />

      {partner ? (
        <section className={styles.pod} data-surface="dark" aria-labelledby="pod-activity">
          <Eyebrow as="h2" tone="accent" id="pod-activity">
            Pod
          </Eyebrow>
          <p className={styles.podText}>
            {partnerActivity.length
              ? `${partner.displayName} ${partnerActivity.join(' and ')}.`
              : `${partner.displayName} hasn't marked this lesson yet.`}
          </p>
          {partner.note ? (
            <>
              <button
                type="button"
                className={styles.podLink}
                aria-expanded={showPartnerNote}
                onClick={() => setShowPartnerNote((open) => !open)}
              >
                {showPartnerNote ? 'Hide the note' : 'Read the note'}
              </button>
              {showPartnerNote ? <p className={styles.podNote}>{partner.note.body}</p> : null}
            </>
          ) : null}
        </section>
      ) : null}

      {lesson.teachBacks.length ? (
        <section className={styles.teachBacks} aria-labelledby="teach-backs" id="teach-backs">
          <Eyebrow as="h2" id="teach-backs">
            Teach-backs
          </Eyebrow>
          {lesson.teachBacks.map((teachBack) => (
            <TeachBack key={teachBack.duelId} teachBack={teachBack} compact />
          ))}
        </section>
      ) : null}
    </aside>
  );
}
