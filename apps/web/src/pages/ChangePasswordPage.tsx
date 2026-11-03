import { PASSWORD_MIN_LENGTH } from '@forward-pass/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { safeNext, useAuth } from '../auth/auth';
import { AuthLayout } from '../auth/AuthLayout';
import { Button, Input } from '../ui';
import styles from '../auth/AuthForm.module.css';

/**
 * Change your password. Forced (no way round it) after the admin sets a temporary one; the
 * current session stays signed in afterwards.
 */
export function ChangePasswordPage() {
  const { me, changePassword, logout } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const forced = me?.user.mustChangePassword ?? false;
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Redirect once the updated account (flag cleared) is in place, so RequireAuth doesn't bounce back.
  if (done && me && !me.user.mustChangePassword) return <Navigate to={next} replace />;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get('newPassword'));
    setError(null);
    setFields({});
    if (newPassword !== String(data.get('confirmPassword'))) {
      setFields({ confirmPassword: 'The two new passwords do not match.' });
      return;
    }
    setSubmitting(true);
    try {
      await changePassword({ currentPassword: String(data.get('currentPassword')), newPassword });
      setDone(true);
    } catch (caught) {
      if (caught instanceof ApiRequestError) {
        if (caught.code === 'wrong_password') setFields({ currentPassword: caught.message });
        else setFields(caught.fields);
        setError(caught.code === 'wrong_password' ? null : caught.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={forced ? 'Choose your own password' : 'Change your password'}
      lede={
        forced
          ? 'You signed in with a temporary password. Pick a new one to continue; you will stay signed in.'
          : 'You will stay signed in here. Any other devices are signed out.'
      }
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {error ? (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        ) : null}
        <Input
          label={forced ? 'Temporary password' : 'Current password'}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          error={fields.currentPassword}
          required
        />
        <Input
          label="New password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          error={fields.newPassword}
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <Input
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={fields.confirmPassword}
          required
        />
        <Button type="submit" block disabled={submitting}>
          {submitting ? 'Saving…' : 'Save new password'}
        </Button>
      </form>
      {forced ? (
        <p className={styles.foot}>
          Not now?{' '}
          <button type="button" className={styles.linkButton} onClick={() => void logout()}>
            Sign out
          </button>
        </p>
      ) : null}
    </AuthLayout>
  );
}
