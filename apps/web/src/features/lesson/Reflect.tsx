import type { PublicDigest } from '@forward-pass/shared';
import { useState } from 'react';
import { Button, Eyebrow, Textarea } from '../../ui';
import styles from './Reflect.module.css';

type ReflectBlock = NonNullable<PublicDigest['reflect']>;

/** An open "explain it" prompt. Never graded: write first, then compare with the model answer. */
export function Reflect({ reflect }: { reflect: ReflectBlock }) {
  const [revealed, setRevealed] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <section className={styles.reflect} aria-labelledby="reflect" id="reflect">
      <Eyebrow as="h2" id="reflect">
        Explain it
      </Eyebrow>
      <Textarea
        label={reflect.prompt}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={5}
        hint="Not graded. Write your own answer first, then compare."
      />
      {revealed ? (
        <div className={styles.model} data-surface="dark">
          <Eyebrow tone="accent">Model answer</Eyebrow>
          <p className={styles.answer}>{reflect.modelAnswer}</p>
          <p className={styles.pointsLabel}>A full answer covers:</p>
          <ul className={styles.points}>
            {reflect.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setRevealed(true)}>
          Compare with the model answer
        </Button>
      )}
    </section>
  );
}
