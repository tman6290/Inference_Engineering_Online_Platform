import type { DuelView } from '@forward-pass/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ApiRequestError } from '../../api/client';
import { Button, ButtonLink } from '../../ui';
import { useAcceptDuel, useStartDuelAttempt } from './api';
import styles from './DuelSummary.module.css';

const until = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });

/** One line on where a duel stands for you. Your partner's score shows only once you both finish. */
export function duelLine(duel: DuelView): string {
  const them = duel.partner.displayName;
  const score = (n: number | null) => `${n ?? 0}/${duel.questionCount}`;
  switch (duel.status) {
    case 'pending':
      return duel.role === 'challenger'
        ? `Waiting for ${them} to accept. The duel closes ${until(duel.deadline)}.`
        : `${them} challenged you. Ten questions each, alone, before ${until(duel.deadline)}.`;
    case 'open':
      if (!duel.mine.attemptId) return `Your turn. Finish before ${until(duel.deadline)}.`;
      if (!duel.mine.finished) return 'Your attempt is in progress.';
      return `You scored ${score(duel.mine.firstTryAccepted)}. ${them}'s score shows once they finish.`;
    case 'complete': {
      const result = `${score(duel.mine.firstTryAccepted)} to ${score(duel.theirs.firstTryAccepted)}`;
      if (duel.outcome === 'draw') return `A draw, ${result}.`;
      const head = duel.outcome === 'won' ? `You won, ${result}.` : `${them} won, ${result}.`;
      if (duel.teachBack.owedBy === 'me' && !duel.teachBack.recorded)
        return `${head} You owe a teach-back.`;
      if (duel.teachBack.owedBy === 'partner' && !duel.teachBack.recorded)
        return `${head} ${them} owes you a teach-back.`;
      return `${head} The teach-back is in the section's notes.`;
    }
    case 'expired':
      return 'Expired before both of you finished. It counts for nobody.';
  }
}

/** A duel's status line and the one action you can take next. */
export function DuelSummary({
  duel,
  compact = false,
  currentAttemptId,
}: {
  duel: DuelView;
  compact?: boolean;
  /** On the attempt page itself there is nothing to resume. */
  currentAttemptId?: string;
}) {
  const accept = useAcceptDuel();
  const start = useStartDuelAttempt();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const fail = (caught: unknown) =>
    setError(caught instanceof ApiRequestError ? caught.message : 'Could not reach the server.');

  const play = () =>
    start.mutate(duel.id, {
      onSuccess: (state) =>
        void navigate(`/checkpoint/${duel.section.number}?attempt=${state.attempt.id}`),
      onError: fail,
    });

  let action = null;
  if (duel.status === 'pending' && duel.role === 'opponent') {
    action = (
      <Button
        variant="secondary"
        disabled={accept.isPending}
        onClick={() => accept.mutate(duel.id, { onError: fail })}
      >
        Accept the duel
      </Button>
    );
  } else if (
    duel.status === 'open' &&
    !duel.mine.finished &&
    !(currentAttemptId && duel.mine.attemptId === currentAttemptId)
  ) {
    action = (
      <Button variant="secondary" disabled={start.isPending} onClick={play}>
        {duel.mine.attemptId ? 'Resume your attempt' : 'Start your duel attempt'}
      </Button>
    );
  } else if (duel.teachBack.owedBy === 'me' && !duel.teachBack.recorded) {
    action = (
      <ButtonLink to={`/duels/${duel.id}/teach-back`} variant="secondary">
        Record your teach-back
      </ButtonLink>
    );
  } else if (duel.teachBack.recorded) {
    action = (
      <ButtonLink to={`/book/${duel.section.number}#teach-backs`} variant="ghost">
        Read the teach-back
      </ButtonLink>
    );
  }

  return (
    <div className={[styles.duel, compact ? styles.compact : ''].join(' ')}>
      {compact ? null : (
        <p className={styles.title}>
          {duel.section.number} {duel.section.title}
          <span className={styles.vs}> · vs {duel.partner.displayName}</span>
        </p>
      )}
      <p className={styles.line}>{duelLine(duel)}</p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}
