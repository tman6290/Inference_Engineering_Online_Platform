import { APP_NAME, healthResponseSchema, SECTION_COUNT } from '@forward-pass/shared';
import { useQuery } from '@tanstack/react-query';
import styles from './PlaceholderPage.module.css';

async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
  return healthResponseSchema.parse(await res.json());
}

export function PlaceholderPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });
  const status = health.isPending ? 'checking' : health.isSuccess ? 'online' : 'offline';

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="title">
        <p className={styles.eyebrow}>Inference Engineering · study pod</p>
        <h1 id="title" className={styles.title}>
          {APP_NAME}
        </h1>
        <p className={styles.lede}>
          {SECTION_COUNT} sections, seven projects, two learners. The boards are coming online.
        </p>
        <p className={styles.status} role="status">
          <span className={styles.dot} data-state={status} aria-hidden="true" />
          API {status}
        </p>
      </section>
    </main>
  );
}
