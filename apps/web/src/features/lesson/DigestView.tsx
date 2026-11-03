import type { Figure, LessonResponse, PublicDigest } from '@forward-pass/shared';
import { Card, Eyebrow, LightbulbIcon } from '../../ui';
import { BookMarkdown } from './BookMarkdown';
import { CheckYourself } from './CheckYourself';
import { Reflect } from './Reflect';
import styles from './DigestView.module.css';

interface DigestViewProps {
  lesson: LessonResponse;
  digest: PublicDigest;
}

/** The authored notes for a lesson, in the Lesson board's order. */
export function DigestView({ lesson, digest }: DigestViewProps) {
  const figures = digest.figureRefs
    .map((ref) => ({ ref, figure: lesson.figures.find((figure) => figure.number === ref.figure) }))
    .filter((entry): entry is { ref: (typeof digest.figureRefs)[number]; figure: Figure } =>
      Boolean(entry.figure),
    );

  return (
    <>
      <Card variant="dark" className={styles.oneLine}>
        <Eyebrow tone="accent">The gist</Eyebrow>
        <p className={styles.oneLineText}>{digest.oneLine}</p>
      </Card>

      <section aria-labelledby="summary" id="summary" className={styles.block}>
        <h2 id="summary" className="visually-hidden">
          Summary
        </h2>
        <BookMarkdown markdown={digest.summary} className={styles.summary} />
      </section>

      <section aria-labelledby="mechanism" id="mechanism" className={styles.block}>
        <h2 id="mechanism" className={styles.heading}>
          How it works
        </h2>
        <ol className={styles.steps}>
          {digest.mechanism.map((step, index) => (
            <li key={step.title}>
              <Card className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <p className={styles.stepTitle}>{step.title}</p>
                <p className={styles.stepBody}>{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {figures.length ? (
        <section aria-labelledby="figures" id="figures" className={styles.block}>
          <h2 id="figures" className={styles.heading}>
            {figures.length === 1 ? 'Figure' : 'Figures'}
          </h2>
          <div className={styles.figures}>
            {figures.map(({ ref, figure }) => (
              <figure key={figure.number} className={styles.figure}>
                <img
                  src={figure.url}
                  alt={figure.caption}
                  loading="lazy"
                  className={styles.figureImage}
                />
                <figcaption className={styles.figureCaption}>
                  <span className={styles.figureNumber}>Figure {figure.number}</span>{' '}
                  {figure.caption}
                  <span className={styles.lookFor}>
                    <strong>Look for:</strong> {ref.lookFor}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}

      {digest.callout ? (
        <aside className={styles.callout} aria-label={digest.callout.name}>
          <LightbulbIcon size={22} className={styles.calloutIcon} />
          <p>
            <strong>{digest.callout.name}.</strong> {digest.callout.body}
          </p>
        </aside>
      ) : null}

      <section aria-labelledby="key-ideas" id="key-ideas" className={styles.block}>
        <h2 id="key-ideas" className={styles.heading}>
          Key ideas
        </h2>
        <ul className={styles.cards}>
          {digest.keyCards.map((card) => (
            <li key={card.title}>
              <Card className={styles.keyCard}>
                <Eyebrow>{card.label}</Eyebrow>
                <p className={styles.keyTitle}>{card.title}</p>
                <p className={styles.keyBody}>{card.body}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {digest.workedExample ? (
        <Card
          as="section"
          variant="dark"
          className={styles.worked}
          aria-labelledby="worked-example"
          id="worked-example"
        >
          <div className={styles.workedHead}>
            <Eyebrow tone="accent">Worked example</Eyebrow>
            <h2 id="worked-example" className={styles.workedTitle}>
              {digest.workedExample.title}
            </h2>
          </div>
          <p className={styles.workedSetup}>{digest.workedExample.setup}</p>
          {/* Focusable so keyboard users can scroll a table wider than the screen. */}
          <div
            className={styles.tableWrap}
            tabIndex={0}
            role="region"
            aria-label="Worked example table"
          >
            <table className={styles.table}>
              <thead>
                <tr>
                  {digest.workedExample.table.columns.map((column) => (
                    <th key={column} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {digest.workedExample.table.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.workedConclusion}>
            {digest.workedExample.conclusion.text}{' '}
            <span className={styles.keyNumber}>{digest.workedExample.conclusion.keyNumber}</span>
          </p>
        </Card>
      ) : null}

      <CheckYourself lessonId={lesson.id} question={digest.checkQuestion} initial={lesson.check} />

      {digest.reflect ? <Reflect reflect={digest.reflect} /> : null}
    </>
  );
}
