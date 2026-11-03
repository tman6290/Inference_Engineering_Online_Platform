import { TEACH_BACK_AUDIO_MAX_BYTES, type TeachBackForm } from '@forward-pass/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../api/client';
import { useSaveTeachBack, useTeachBack, useUploadTeachBackAudio } from '../features/pod/api';
import { TeachBack } from '../features/pod/TeachBack';
import { PageHeader } from '../shell/PageHeader';
import { Button, Card, Eyebrow, Textarea } from '../ui';
import styles from './TeachBackPage.module.css';

const errorText = (error: unknown) =>
  error instanceof ApiRequestError ? error.message : 'Could not reach the server. Try again.';

/** The loser's form: an answer per missed question in their own words, or a recording. */
function Form({ data }: { data: TeachBackForm }) {
  const save = useSaveTeachBack(data.duel.id);
  const upload = useUploadTeachBackAudio(data.duel.id);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const recorded = data.duel.teachBack.recorded;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const entries = data.missed.map((question) => ({
      questionId: question.questionId,
      text: String(form.get(question.questionId) ?? '').trim(),
    }));
    save.mutate(entries, { onError: (caught) => setError(errorText(caught)) });
  };

  const sendAudio = () => {
    if (!file) return;
    setError(null);
    if (file.size > TEACH_BACK_AUDIO_MAX_BYTES) return setError('Recordings can be at most 5 MB.');
    upload.mutate(file, { onError: (caught) => setError(errorText(caught)) });
  };

  const previous = new Map(
    (data.teachBack?.entries ?? []).map((entry) => [entry.questionId, entry.text]),
  );

  return (
    <div className={styles.page}>
      <p className={styles.lead}>
        You missed {data.missed.length} on the first try. Explain each one as if teaching{' '}
        {data.duel.partner.displayName}: about three minutes in all. Write an answer for every
        question, or upload a recording instead.
      </p>
      {recorded ? (
        <p role="status" className={styles.done}>
          Recorded. {data.duel.partner.displayName} can read it in the notes for{' '}
          <Link to={`/book/${data.duel.section.number}#teach-backs`}>
            {data.duel.section.number}
          </Link>
          .
        </p>
      ) : null}

      <form onSubmit={submit} className={styles.form}>
        {data.missed.map((question, index) => (
          <Card
            key={question.questionId}
            as="section"
            className={styles.question}
            aria-labelledby={`q-${index}`}
          >
            <Eyebrow id={`q-${index}`}>Missed question {index + 1}</Eyebrow>
            <p className={styles.prompt}>{question.prompt}</p>
            <details className={styles.explanation}>
              <summary>The explanation, if you need it</summary>
              <p>{question.explanation}</p>
            </details>
            <Textarea
              label="Your explanation"
              name={question.questionId}
              rows={4}
              maxLength={2000}
              defaultValue={previous.get(question.questionId) ?? ''}
            />
          </Card>
        ))}
        <div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save written teach-back'}
          </Button>
        </div>
      </form>

      <Card as="section" className={styles.audio} aria-labelledby="audio-title">
        <h2 id="audio-title" className={styles.audioTitle}>
          Or upload a recording
        </h2>
        <label className={styles.fileLabel}>
          <span>Audio file (WebM, Ogg, MP3, M4A or WAV, up to 5 MB)</span>
          <input
            type="file"
            accept="audio/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div>
          <Button variant="secondary" disabled={!file || upload.isPending} onClick={sendAudio}>
            {upload.isPending ? 'Uploading…' : 'Upload the recording'}
          </Button>
        </div>
      </Card>

      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TeachBackPage() {
  const { duelId = '' } = useParams();
  const query = useTeachBack(duelId);
  const data = query.data;
  const owedByMe = data?.duel.teachBack.owedBy === 'me';

  return (
    <>
      <PageHeader
        eyebrow={data ? `Teach-back · ${data.duel.section.number}` : 'Teach-back'}
        title={data ? data.duel.section.title : 'Teach-back'}
        description={
          data
            ? owedByMe
              ? `${data.duel.partner.displayName} won this duel.`
              : `You won this duel. ${data.duel.partner.displayName} owes the teach-back.`
            : undefined
        }
      />
      {query.isPending ? (
        <p role="status">Loading…</p>
      ) : query.isError ? (
        <p role="alert">{errorText(query.error)}</p>
      ) : owedByMe ? (
        <Form data={query.data} />
      ) : query.data.teachBack ? (
        <TeachBack teachBack={query.data.teachBack} />
      ) : (
        <p>Not recorded yet. It will show here and in the section&apos;s notes once it is.</p>
      )}
    </>
  );
}
