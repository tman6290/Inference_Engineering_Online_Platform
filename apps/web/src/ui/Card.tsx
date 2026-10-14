import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import styles from './Card.module.css';

/**
 * paper   default reading surface
 * dark    ink-green; "the machine talking" (verdicts, worked examples, stats)
 * tinted  soft mint wash for asides like the duel rules
 * dashed  something not yet started (queued chapter, locked project)
 */
export type CardVariant = 'paper' | 'dark' | 'tinted' | 'dashed';

interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant;
  as?: ElementType;
  padding?: 'md' | 'lg';
  children: ReactNode;
}

export function Card({
  variant = 'paper',
  as: Tag = 'div',
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      data-surface={variant === 'dark' ? 'dark' : undefined}
      className={[styles.card, styles[variant], styles[padding], className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
