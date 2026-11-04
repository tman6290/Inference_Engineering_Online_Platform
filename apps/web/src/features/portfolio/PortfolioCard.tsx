import type { PortfolioResponse } from '@forward-pass/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiRequestError } from '../../api/client';
import { Button, Card, Input, Toggle } from '../../ui';
import { caseStudyPath, pdfUrl, usePortfolio, useSaveSettings, useSetVisibility } from './api';
import styles from './PortfolioCard.module.css';

const errorText = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Could not reach the server. Try again.';

function Settings({ portfolio }: { portfolio: PortfolioResponse }) {
  const save = useSaveSettings();
  const [username, setUsername] = useState(portfolio.username ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = (pageLive: boolean) => {
    setError(null);
    save.mutate(
      { username: username.trim() || null, pageLive },
      { onError: (caught) => setError(errorText(caught)) },
    );
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(portfolio.pageLive);
  };

  return (
    <form className={styles.settings} onSubmit={onSubmit}>
      <div className={styles.nameRow}>
        <Input
          label="Username"
          name="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          hint="Your public address is /p/ followed by it."
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="secondary" disabled={save.isPending}>
          Save
        </Button>
      </div>
      <Toggle
        label="Page is live"
        checked={portfolio.pageLive}
        disabled={save.isPending}
        onChange={submit}
        description={
          portfolio.pageLive && portfolio.username ? (
            <>
              Anyone with the link can see{' '}
              <Link to={`/p/${encodeURIComponent(portfolio.username)}`}>
                /p/{portfolio.username}
              </Link>
              .
            </>
          ) : (
            'Off: your profile and case studies answer "not found".'
          )
        }
      />
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </form>
  );
}

function Shipped({ portfolio }: { portfolio: PortfolioResponse }) {
  const visibility = useSetVisibility();
  const [error, setError] = useState<string | null>(null);
  if (!portfolio.shipped.length) {
    return (
      <p className={styles.muted}>
        A project shows up here once a version scores 80 or more with every dimension at 60%.
      </p>
    );
  }
  return (
    <>
      <ul className={styles.list}>
        {portfolio.shipped.map((entry) => {
          const isPublic = entry.publicVersion !== null;
          return (
            <li key={entry.slug} className={styles.entry}>
              <div className={styles.entryHead}>
                <Link to={`/projects/${entry.slug}`} className={styles.entryTitle}>
                  {String(entry.number).padStart(2, '0')} {entry.title}
                </Link>
                <span className={styles.mono}>
                  v{entry.version} · {entry.total}/100
                </span>
              </div>
              <Toggle
                label={`Public case study: ${entry.title}`}
                checked={isPublic}
                disabled={visibility.isPending}
                onChange={(next) => {
                  setError(null);
                  visibility.mutate(
                    { submissionId: entry.submissionId, isPublic: next },
                    { onError: (caught) => setError(errorText(caught)) },
                  );
                }}
                description={
                  isPublic
                    ? entry.publicVersion === entry.version
                      ? 'This version is public.'
                      : `v${entry.publicVersion} is public; switching on shows v${entry.version} instead.`
                    : 'Private.'
                }
              />
              <p className={styles.links}>
                {isPublic && portfolio.pageLive && portfolio.username ? (
                  <Link to={caseStudyPath(portfolio.username, entry.slug)}>View case study</Link>
                ) : null}
                <a href={pdfUrl(entry.submissionId)} download>
                  Download PDF
                </a>
              </p>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </>
  );
}

/** The Progress page's portfolio: public page settings and the projects shipped. */
export function PortfolioCard({ className }: { className?: string }) {
  const query = usePortfolio();
  return (
    <Card as="section" padding="lg" className={className} aria-labelledby="portfolio-title">
      <h2 id="portfolio-title" className={styles.title}>
        Portfolio
      </h2>
      {query.isPending ? (
        <p role="status">Loading…</p>
      ) : query.isError ? (
        <p role="alert">{errorText(query.error)}</p>
      ) : (
        <>
          <p className={styles.muted}>
            {query.data.shipped.length} of 7 projects shipped. Nothing is public until you turn it
            on.
          </p>
          <Settings portfolio={query.data} />
          <Shipped portfolio={query.data} />
        </>
      )}
    </Card>
  );
}
