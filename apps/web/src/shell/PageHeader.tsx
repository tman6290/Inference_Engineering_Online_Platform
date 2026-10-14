import type { ReactNode } from 'react';
import { Eyebrow } from '../ui';
import { ThemeToggle } from './ThemeToggle';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      <div className={styles.actions}>
        {actions}
        <ThemeToggle className={styles.themeToggle} />
      </div>
    </header>
  );
}
