import type { ReactNode } from 'react';
import { PageHeader } from '../shell/PageHeader';
import { Card, Eyebrow } from '../ui';
import styles from './Placeholder.module.css';

interface PlaceholderProps {
  eyebrow?: string;
  title: string;
  description: ReactNode;
  /** What this page will hold once built. */
  plan: string[];
  children?: ReactNode;
}

export function Placeholder({ eyebrow, title, description, plan, children }: PlaceholderProps) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      {children}
      <Card variant="dashed" className={styles.plan}>
        <Eyebrow as="h2">Coming to this page</Eyebrow>
        <ul className={styles.list}>
          {plan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Card>
    </>
  );
}
