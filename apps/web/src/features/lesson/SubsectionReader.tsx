import type { Figure, LessonResponse, PublicDigest } from '@forward-pass/shared';
import { useId, useRef, useState } from 'react';
import { Button } from '../../ui';
import { BookMarkdown } from './BookMarkdown';
import styles from './SubsectionReader.module.css';

interface SubsectionReaderProps {
  subsections: LessonResponse['subsections'];
  /** Hooks from the digest's subsection cards, when there is one. */
  cards?: PublicDigest['subsectionCards'];
  figures: Figure[];
}

/** Subsection cards; each opens that subsection's book text below the grid. */
export function SubsectionReader({ subsections, cards = [], figures }: SubsectionReaderProps) {
  const [open, setOpen] = useState<string | null>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const opened = subsections.find((sub) => sub.number === open) ?? null;

  if (subsections.length === 0) return null;

  const toggle = (number: string) => {
    const next = open === number ? null : number;
    setOpen(next);
    if (next) requestAnimationFrame(() => panelRef.current?.focus());
  };

  return (
    <section className={styles.reader} aria-labelledby="read-the-book" id="read-the-book">
      <h2 id="read-the-book" className={styles.heading}>
        From the book
      </h2>
      <ul className={styles.cards}>
        {subsections.map((sub) => {
          const card = cards.find((entry) => entry.number === sub.number);
          const expanded = open === sub.number;
          return (
            <li key={sub.number} id={`sub-${sub.number}`}>
              <button
                type="button"
                className={[styles.card, expanded ? styles.active : ''].join(' ')}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(sub.number)}
              >
                <span className={styles.meta}>
                  <span>{sub.number}</span>
                  <span>{card?.readingMinutes ?? sub.readingMinutes} min</span>
                </span>
                <span className={styles.title}>{sub.title}</span>
                {card ? <span className={styles.hook}>{card.hook}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div
        id={panelId}
        ref={panelRef}
        tabIndex={-1}
        className={styles.panel}
        hidden={!opened}
        aria-label={opened ? `${opened.number} ${opened.title}` : undefined}
        role="region"
      >
        {opened ? (
          <>
            <h3 className={styles.panelTitle}>
              {opened.number} {opened.title}
            </h3>
            <BookMarkdown
              markdown={opened.markdown}
              figures={figures.filter((figure) => figure.subsectionNumber === opened.number)}
            />
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Close {opened.number}
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
