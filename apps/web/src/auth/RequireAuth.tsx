import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button } from '../ui';
import { useAuth } from './auth';
import styles from './RequireAuth.module.css';

/** Renders its children for a signed-in user; otherwise sends them to /login and back afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <main className={styles.screen}>
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className={styles.screen}>
        <h1 className={styles.title}>Can&apos;t reach the server</h1>
        <p className={styles.text}>Check that the API is running, then try again.</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </main>
    );
  }

  if (!me) {
    const next = `${location.pathname}${location.search}`;
    const target = next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`;
    return <Navigate to={target} replace />;
  }

  return children;
}
