import { useId } from 'react';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  /** 0 to 100. */
  value: number;
  /** Visible label. Also names the bar for assistive tech. */
  label: string;
  /** Right-hand readout. Defaults to the rounded percentage. */
  valueText?: string;
  /** Hides the label row; the label still names the bar. */
  hideLabel?: boolean;
  className?: string;
}

/** Continuous bar for percentages. */
export function ProgressBar({
  value,
  label,
  valueText,
  hideLabel = false,
  className,
}: ProgressBarProps) {
  const id = useId();
  const clamped = Math.min(100, Math.max(0, value));
  const readout = valueText ?? `${Math.round(clamped)}%`;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      {hideLabel ? null : (
        <div className={styles.labelRow}>
          <span id={id}>{label}</span>
          <span>{readout}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-labelledby={hideLabel ? undefined : id}
        aria-label={hideLabel ? label : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        aria-valuetext={readout}
        className={styles.track}
      >
        <div className={styles.fill} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

export type SegmentState = 'accepted' | 'retry' | 'current' | 'empty';

const segmentWords: Record<SegmentState, string> = {
  accepted: 'accepted',
  retry: 'accepted on retry',
  current: 'current',
  empty: 'not yet answered',
};

interface SegmentedProgressProps {
  segments: SegmentState[];
  label: string;
  className?: string;
}

/** Segmented bar for finite sets, such as the 10 questions of a checkpoint. */
export function SegmentedProgress({ segments, label, className }: SegmentedProgressProps) {
  const id = useId();
  const done = segments.filter((s) => s === 'accepted' || s === 'retry').length;

  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <div className={styles.labelRow}>
        <span id={id}>{label}</span>
        <span>
          {done} / {segments.length}
        </span>
      </div>
      <ol className={styles.segments} aria-labelledby={id}>
        {segments.map((state, index) => (
          <li key={index} className={[styles.segment, styles[state]].join(' ')}>
            <span className="visually-hidden">
              Question {index + 1}: {segmentWords[state]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
