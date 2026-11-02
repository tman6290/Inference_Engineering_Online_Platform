import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { safeNext, useAuth } from '../auth/auth';
import { AuthLayout } from '../auth/AuthLayout';
import { Button, Input } from '../ui';
import styles from '../auth/AuthForm.module.css';

export function LoginPage() {
  const { me, login } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (me) return <Navigate to={next} replace />;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      // On success `me` is set and the <Navigate> above takes the user to `next`.
      await login({ email: String(data.get('email')), password: String(data.get('password')) });
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : 'Could not reach the server. Check your connection and try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Sign in" lede="Welcome back to the pod.">
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {error ? (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        ) : null}
        <Input label="Email" name="email" type="email" autoComplete="email" required />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className={styles.foot}>
        New here? Open the invite link you were sent. Forgot your password? Ask the admin to reset
        it.
      </p>
    </AuthLayout>
  );
}
