import { useId, type ReactNode } from 'react';
import { Card } from './Card';
import { Eyebrow } from './Eyebrow';
import { ProgressBar } from './ProgressBar';
import styles from './StatTile.module.css';

interface StatTileProps {
  label: string;
  /** The big number, e.g. "41%" or "3h 40m". */
  value: ReactNode;
  /** Smaller suffix after the value, e.g. "/7". */
  unit?: string;
  caption?: ReactNode;
  /** 0 to 100. Draws a bar under the caption. */
  progress?: number;
  /** Footer slot, e.g. a link or a sparkline. */
  footer?: ReactNode;
  dark?: boolean;
}

export function StatTile({ label, value, unit, caption, progress, footer, dark }: StatTileProps) {
  const labelId = useId();
  return (
    <Card
      as="section"
      variant={dark ? 'dark' : 'paper'}
      aria-labelledby={labelId}
      className={styles.tile}
    >
      <Eyebrow id={labelId}>{label}</Eyebrow>
      <p className={styles.value}>
        {value}
        {unit ? <span className={styles.unit}>{unit}</span> : null}
      </p>
      {caption ? <p className={styles.caption}>{caption}</p> : null}
      {progress !== undefined ? (
        <ProgressBar value={progress} label={label} hideLabel className={styles.bar} />
      ) : null}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </Card>
  );
}
