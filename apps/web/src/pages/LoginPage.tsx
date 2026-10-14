import { useState, type FormEvent } from 'react';
import { ThemeToggle } from '../shell/ThemeToggle';
import { Button, Card, Eyebrow, Input, LogoMark } from '../ui';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
  };

  return (
    <main id="main" className={styles.page}>
      <div className={styles.corner}>
        <ThemeToggle />
      </div>
      <div className={styles.column}>
        <div className={styles.brand}>
          <span className={styles.logoTile}>
            <LogoMark size={30} />
          </span>
          <div>
            <p className={styles.name}>Forward Pass</p>
            <Eyebrow>Inference Engineering</Eyebrow>
          </div>
        </div>

        <Card padding="lg" className={styles.card}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.lede}>
            Two seats, one pod. Use the account you made with your invite code.
          </p>
          <form className={styles.form} onSubmit={onSubmit} noValidate>
            <Input label="Username" name="username" autoComplete="username" required />
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
            <Button type="submit" block>
              Sign in
            </Button>
          </form>
          {submitted ? (
            <p className={styles.note} role="status">
              Sign-in isn&apos;t wired up yet.
            </p>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
