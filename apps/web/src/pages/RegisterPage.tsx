import { PASSWORD_MIN_LENGTH } from '@forward-pass/shared';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useAuth } from '../auth/auth';
import { AuthLayout } from '../auth/AuthLayout';
import { Button, Input } from '../ui';
import styles from '../auth/AuthForm.module.css';

const errorCopy: Record<string, string> = {
  invalid_invite: 'This invite link is not valid. Check that you opened the full link.',
  invite_spent: 'This invite link has already been used. Sign in instead.',
  pod_full: 'Both seats are taken. Sign in instead.',
  email_taken: 'An account with that email already exists. Sign in instead.',
};

export function RegisterPage() {
  const { me, register } = useAuth();
  const [params] = useSearchParams();
  const code = params.get('code')?.trim() ?? '';
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (me) return <Navigate to="/" replace />;

  if (!code) {
    return (
      <AuthLayout
        title="You need an invite link"
        lede="Each seat in the pod is claimed with its own invite link. Ask for yours, or sign in if you already have an account."
      >
        <p className={styles.foot}>
          <Link to="/login">Go to sign in</Link>
        </p>
      </AuthLayout>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    setFields({});
    try {
      await register({
        displayName: String(data.get('displayName')),
        email: String(data.get('email')),
        password: String(data.get('password')),
        inviteCode: code,
      });
      // On success `me` is set and the <Navigate> above takes the user Home.
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        setFields(caught.fields);
        setError(errorCopy[caught.code] ?? caught.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Claim your seat" lede="Create the account you'll study with.">
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {error ? (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        ) : null}
        <Input
          label="Your name"
          name="displayName"
          autoComplete="given-name"
          hint="Your partner sees this. The first letter becomes your avatar."
          error={fields.displayName}
          required
        />
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={fields.email}
          required
        />
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={fields.password}
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
      <p className={styles.foot}>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
