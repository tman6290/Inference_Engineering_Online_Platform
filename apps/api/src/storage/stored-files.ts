import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Db } from '../db';

// Upload bytes live in the database (SubmissionFileBlob, TeachBackAudio), because hosts such as
// Render's free tier wipe their disk on every restart. Uploads saved under uploads/ before that
// change are still read from there.

export const submissionFilesDir = (uploadsDir: string, submissionId: string) =>
  path.join(uploadsDir, 'submissions', submissionId);

const fromDisk = (file: string): Promise<Buffer | null> => readFile(file).catch(() => null);

/** An upload's bytes, or null when they are gone. */
export async function submissionFileBytes(
  db: Db,
  uploadsDir: string,
  file: { id: string; submissionId: string; name: string },
): Promise<Buffer | null> {
  const blob = await db.submissionFileBlob.findUnique({ where: { fileId: file.id } });
  if (blob) return Buffer.from(blob.data);
  return fromDisk(path.join(submissionFilesDir(uploadsDir, file.submissionId), file.name));
}

/** A teach-back recording's bytes, or null when there is none. */
export async function teachBackAudioBytes(
  db: Db,
  uploadsDir: string,
  teachBack: { id: string; audioFile: string | null },
): Promise<Buffer | null> {
  if (!teachBack.audioFile) return null;
  const audio = await db.teachBackAudio.findUnique({ where: { teachBackId: teachBack.id } });
  if (audio) return Buffer.from(audio.data);
  return fromDisk(path.join(uploadsDir, 'teach-backs', teachBack.audioFile));
}
