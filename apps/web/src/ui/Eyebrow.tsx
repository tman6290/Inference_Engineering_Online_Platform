import type { ElementType, ReactNode } from 'react';
import styles from './Eyebrow.module.css';

export type EyebrowTone = 'mute' | 'accent';

interface EyebrowProps {
  children: ReactNode;
  /** `accent` is forest on paper and lime on dark surfaces. */
  tone?: EyebrowTone;
  as?: ElementType;
  className?: string;
  id?: string;
}

export function Eyebrow({ children, tone = 'mute', as: Tag = 'p', className, id }: EyebrowProps) {
  return (
    <Tag id={id} className={[styles.eyebrow, styles[tone], className].filter(Boolean).join(' ')}>
      {children}
    </Tag>
  );
}
