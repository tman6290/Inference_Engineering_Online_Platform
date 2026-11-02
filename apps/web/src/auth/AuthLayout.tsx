import type { ReactNode } from 'react';
import { ThemeToggle } from '../shell/ThemeToggle';
import { LogoMark } from '../ui';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}

/** Paper card with the dark brand panel on the left; stacks on small screens. */
export function AuthLayout({ title, lede, children }: AuthLayoutProps) {
  return (
    <main id="main" className={styles.page}>
      <div className={styles.corner}>
        <ThemeToggle />
      </div>
      <div className={styles.card}>
        <section className={styles.brand} data-surface="dark" aria-label="Forward Pass">
          <span className={styles.logoTile}>
            <LogoMark size={28} />
          </span>
          <div className={styles.brandText}>
            <p className={styles.name}>Forward Pass</p>
            <p className={styles.sub}>Inference Engineering</p>
          </div>
          <p className={styles.pitch}>
            A two-seat study pod for the book: read a section, pass its checkpoint, ship the
            chapter&apos;s project.
          </p>
        </section>
        <section className={styles.form} aria-labelledby="auth-title">
          <h1 id="auth-title" className={styles.title}>
            {title}
          </h1>
          {lede ? <p className={styles.lede}>{lede}</p> : null}
          {children}
        </section>
      </div>
    </main>
  );
}
