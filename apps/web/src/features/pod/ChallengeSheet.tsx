import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ApiRequestError } from '../../api/client';
import { Button } from '../../ui';
import { useCreateDuel } from './api';
import styles from './ChallengeSheet.module.css';

interface ChallengeSheetProps {
  section: { sectionNumber: string; title: string };
  partnerName: string;
  onClose: () => void;
}

/** Confirms a duel challenge. Focus starts on "Send" and returns to the opener on close. */
export function ChallengeSheet({ section, partnerName, onClose }: ChallengeSheetProps) {
  const create = useCreateDuel();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const titleId = useId();
  const sendRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    sendRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      // Keep focus on the sheet's two buttons.
      event.preventDefault();
      (document.activeElement === sendRef.current ? cancelRef : sendRef).current?.focus();
    }
  };

  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.sheet}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id={titleId} className={styles.title}>
          {sent
            ? `Challenge sent to ${partnerName}`
            : `Challenge ${partnerName} on ${section.sectionNumber} ${section.title}?`}
        </h2>
        {sent ? (
          <p>They have 48 hours to accept and play. You can take your attempt once they accept.</p>
        ) : (
          <>
            <p>
              You each take the same ten fresh questions on this section, alone, within 48 hours.
            </p>
            <p>
              Higher first-try acceptance wins and fewer hints breaks a tie. The loser records a
              3-minute teach-back on the questions they missed.
            </p>
          </>
        )}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          {sent ? (
            <Button ref={sendRef} onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button
                ref={sendRef}
                disabled={create.isPending}
                onClick={() =>
                  create.mutate(section.sectionNumber, {
                    onSuccess: () => setSent(true),
                    onError: (caught) =>
                      setError(
                        caught instanceof ApiRequestError
                          ? caught.message
                          : 'Could not send the challenge.',
                      ),
                  })
                }
              >
                Send the challenge
              </Button>
              <Button ref={cancelRef} variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
