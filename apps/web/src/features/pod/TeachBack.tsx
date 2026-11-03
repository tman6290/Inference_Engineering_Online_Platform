import type { TeachBackView } from '@forward-pass/shared';
import styles from './TeachBack.module.css';

/** A recorded teach-back: the author's answer to each question they missed, and any recording. */
export function TeachBack({
  teachBack,
  compact = false,
}: {
  teachBack: TeachBackView;
  compact?: boolean;
}) {
  return (
    <div className={[styles.teachBack, compact ? styles.compact : ''].join(' ')}>
      <p className={styles.meta}>
        {teachBack.author.displayName} on {teachBack.section.number},{' '}
        {new Date(teachBack.createdAt).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        })}
      </p>
      {teachBack.audioUrl ? (
        <audio controls preload="none" src={teachBack.audioUrl} className={styles.audio}>
          <a href={teachBack.audioUrl}>Download the recording</a>
        </audio>
      ) : null}
      {teachBack.entries.map((entry) => (
        <details key={entry.questionId} className={styles.entry} open={!compact}>
          <summary>{entry.prompt}</summary>
          <p className={styles.text}>{entry.text}</p>
        </details>
      ))}
    </div>
  );
}
