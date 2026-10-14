import type { ReactNode } from 'react';
import styles from './Chip.module.css';

/**
 * Status chips from the Foundations board.
 * accepted / done / public  -> mint
 * retry / private           -> cream
 * reading                   -> forest on paper, lime on dark
 * upNext                    -> neutral fill
 * queued                    -> outline only
 */
export type ChipStatus =
  'accepted' | 'done' | 'public' | 'retry' | 'private' | 'reading' | 'upNext' | 'queued';

interface ChipProps {
  status: ChipStatus;
  children: ReactNode;
  className?: string;
}

const tone: Record<ChipStatus, string> = {
  accepted: styles.ok!,
  done: styles.ok!,
  public: styles.ok!,
  retry: styles.warn!,
  private: styles.warn!,
  reading: styles.reading!,
  upNext: styles.neutral!,
  queued: styles.outline!,
};

export function Chip({ status, children, className }: ChipProps) {
  return (
    <span className={[styles.chip, tone[status], className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
}
