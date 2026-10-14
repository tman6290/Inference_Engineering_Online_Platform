import { useId, type ReactNode } from 'react';
import styles from './Toggle.module.css';

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  description?: ReactNode;
  disabled?: boolean;
}

/** On/off switch. A real button with role="switch". */
export function Toggle({ label, checked, onChange, description, disabled }: ToggleProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <span id={`${id}-label`} className={styles.label}>
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={styles.switch}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
