import type { StudyDayView } from '@forward-pass/shared';
import { monthOf, plural, shortDate } from './format';
import styles from './Heatmap.module.css';

const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

function describe(day: StudyDayView): string {
  if (!day.intensity) return `${shortDate(day.date)}: no study`;
  const parts = [`${day.readingMinutes} min reading`];
  if (day.answersGraded) parts.push(plural(day.answersGraded, 'answer'));
  if (day.sectionsRead) parts.push(`${plural(day.sectionsRead, 'lesson')} read`);
  return `${shortDate(day.date)}: ${parts.join(', ')}`;
}

/** Twelve weeks of study days: weeks run left to right, Monday to Sunday top to bottom. */
export function Heatmap({ days }: { days: StudyDayView[] }) {
  const weeks: StudyDayView[][] = [];
  days.forEach((day, index) => {
    if (index % 7 === 0) weeks.push([]);
    weeks.at(-1)!.push(day);
  });
  const studied = days.filter((day) => day.intensity > 0).length;

  return (
    // Focusable because a phone scrolls the grid sideways inside the card.
    <figure className={styles.figure} tabIndex={0} aria-label="Study days heatmap">
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `auto repeat(${weeks.length}, 22px)` }}
        role="img"
        aria-label={`${plural(studied, 'study day')} in the last ${plural(weeks.length, 'week')}`}
      >
        <span />
        {weeks.map((week, index) => {
          const month = monthOf(week[0]!.date);
          const showMonth = index === 0 || monthOf(weeks[index - 1]![0]!.date) !== month;
          return (
            <span key={week[0]!.date} className={styles.month}>
              {showMonth ? month : ''}
            </span>
          );
        })}
        {ROW_LABELS.map((label, row) => (
          <Row key={row} label={label} cells={weeks.map((week) => week[row])} />
        ))}
      </div>
      <figcaption className={styles.legend}>
        <span>Less</span>
        {[0, 1, 2, 3].map((step) => (
          <span key={step} className={[styles.cell, styles[`step${step}`]].join(' ')} />
        ))}
        <span>More</span>
      </figcaption>
    </figure>
  );
}

function Row({ label, cells }: { label: string; cells: (StudyDayView | undefined)[] }) {
  return (
    <>
      <span className={styles.rowLabel}>{label}</span>
      {cells.map((day, index) =>
        day ? (
          <span
            key={day.date}
            className={[styles.cell, styles[`step${day.intensity}`]].join(' ')}
            title={describe(day)}
          />
        ) : (
          <span key={`empty-${index}`} />
        ),
      )}
    </>
  );
}
