import { CONFIDENCE_LEVELS, type Confidence } from '@forward-pass/shared';
import { useId } from 'react';
import styles from './ConfidencePills.module.css';

const labels: Record<Confidence, string> = { shaky: 'Shaky', okay: 'Okay', solid: 'Solid' };

interface ConfidencePillsProps {
  /** Question shown as the group label. */
  legend: string;
  value: Confidence | null;
  onChange?: (value: Confidence) => void;
  /** Visually hides the legend; it still names the group. */
  hideLegend?: boolean;
  disabled?: boolean;
  name?: string;
}

/** Shaky / okay / solid rating. A radio group styled as pills. */
export function ConfidencePills({
  legend,
  value,
  onChange,
  hideLegend = false,
  disabled = false,
  name,
}: ConfidencePillsProps) {
  const autoName = useId();
  const groupName = name ?? autoName;

  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={hideLegend ? 'visually-hidden' : styles.legend}>{legend}</legend>
      <div className={styles.pills}>
        {CONFIDENCE_LEVELS.map((level) => (
          <label key={level} className={[styles.pill, styles[level]].join(' ')}>
            <input
              type="radio"
              name={groupName}
              value={level}
              checked={value === level}
              onChange={() => onChange?.(level)}
              className={styles.input}
            />
            <span>{labels[level]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
