import {
  PORTFOLIO_DIMENSION_SHARE,
  PORTFOLIO_TOTAL,
  type SubmissionDetail,
} from '@forward-pass/shared';
import { Link } from 'react-router';
import { Card, Chip, Eyebrow, ProgressBar } from '../../ui';
import styles from './CritiquePanel.module.css';

const statusWords = {
  queued: 'Waiting for the runner',
  checking: 'Running the checks',
  critiquing: 'Writing the critique',
  graded: 'Graded',
  failed: 'Failed',
} as const;

/** Check results, then the critique: score, dimensions, three columns, comments and the gate. */
export function CritiquePanel({ submission }: { submission: SubmissionDetail }) {
  const critique = submission.critique;
  const working = !['graded', 'failed'].includes(submission.status);
  return (
    <div className={styles.panel}>
      <p className={styles.status} role="status">
        Version {submission.version} · {statusWords[submission.status]}
        {working ? '…' : ''}
        {submission.commitSha ? ` · commit ${submission.commitSha.slice(0, 7)}` : ''}
      </p>
      {submission.failure ? (
        <p role="alert" className={styles.failure}>
          {submission.failure}
        </p>
      ) : null}

      {submission.checks.length ? (
        <section aria-labelledby={`checks-${submission.id}`} className={styles.checks}>
          <Eyebrow as="h3" id={`checks-${submission.id}`}>
            Checks
          </Eyebrow>
          <ul className={styles.checkList}>
            {submission.checks.map((check) => (
              <li key={check.checkId}>
                <details>
                  <summary className={styles.checkRow}>
                    <Chip status={check.passed ? 'accepted' : 'retry'}>
                      {check.passed ? 'Passed' : 'Failed'}
                    </Chip>
                    <span>{check.label}</span>
                    <span className={styles.mono}>{(check.durationMs / 1000).toFixed(1)} s</span>
                  </summary>
                  <pre className={styles.log} tabIndex={0}>
                    {check.log}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {critique ? (
        <Card
          as="section"
          variant="dark"
          padding="lg"
          className={styles.critique}
          aria-labelledby={`critique-${submission.id}`}
        >
          <div className={styles.head}>
            <div>
              <Eyebrow tone="accent">Critique</Eyebrow>
              <h3 id={`critique-${submission.id}`} className={styles.headline}>
                {critique.headline}
              </h3>
            </div>
            <p className={styles.score}>
              {critique.total}
              <span className={styles.outOf}>/100</span>
            </p>
          </div>

          <ul className={styles.dimensions}>
            {critique.dimensions.map((dimension) => (
              <li key={dimension.dimension} className={styles.dimension}>
                <span className={styles.dimensionName}>{dimension.dimension}</span>
                <span className={styles.dimensionScore}>
                  {dimension.score}/{dimension.max}
                </span>
                <ProgressBar
                  value={(dimension.score / dimension.max) * 100}
                  label={dimension.dimension}
                  hideLabel
                />
                <span className={styles.reasoning}>{dimension.reasoning}</span>
              </li>
            ))}
          </ul>

          <div className={styles.columns}>
            <section aria-label="What is right">
              <Eyebrow as="h4">What is right</Eyebrow>
              <ul>
                {critique.right.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
            <section aria-label="What is wrong">
              <Eyebrow as="h4">What is wrong</Eyebrow>
              <ul>
                {critique.wrong.map((item) => (
                  <li key={item.text}>
                    {item.text}{' '}
                    <code className={styles.evidence}>
                      {item.evidence.kind}: {item.evidence.ref}
                    </code>
                  </li>
                ))}
              </ul>
            </section>
            <section aria-label="Work on">
              <Eyebrow as="h4">Work on</Eyebrow>
              <ul>
                {critique.workOn.map((item) => (
                  <li key={item.step}>
                    {item.step}
                    {item.section ? (
                      <>
                        {' '}
                        <Link to={`/book/${item.section}`} className={styles.section}>
                          Read {item.section}
                        </Link>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {critique.unsupportedClaims.length ? (
            <section aria-label="Unsupported claims" className={styles.block}>
              <Eyebrow as="h4">Claims results.json doesn&apos;t back</Eyebrow>
              <ul>
                {critique.unsupportedClaims.map((claim) => (
                  <li key={claim.claim}>
                    “{claim.claim}” <span className={styles.muted}>{claim.why}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {critique.inlineComments.length ? (
            <section aria-label="Inline comments" className={styles.block}>
              <Eyebrow as="h4">Inline comments</Eyebrow>
              <ul className={styles.comments}>
                {critique.inlineComments.map((comment) => (
                  <li key={`${comment.path}:${comment.line}:${comment.body}`}>
                    <code className={styles.mono}>
                      {comment.path}:{comment.line}
                    </code>{' '}
                    {comment.body}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="Portfolio gate" className={styles.block}>
            <ProgressBar
              value={Math.min(100, (critique.total / PORTFOLIO_TOTAL) * 100)}
              label="Portfolio gate"
              valueText={
                critique.portfolioReady
                  ? 'Portfolio-ready'
                  : `${critique.total} of ${PORTFOLIO_TOTAL}, and every dimension at ${Math.round(PORTFOLIO_DIMENSION_SHARE * 100)}%`
              }
            />
          </section>

          <p className={styles.meta}>
            {critique.skillsDemonstrated.length
              ? `Skills: ${critique.skillsDemonstrated.join(', ')}. `
              : ''}
            Graded by {critique.model}
            {critique.costUsd !== null ? ` for $${critique.costUsd.toFixed(4)}` : ''}.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
