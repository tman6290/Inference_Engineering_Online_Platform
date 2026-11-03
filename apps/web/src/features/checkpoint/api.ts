import {
  attemptAnswerResponseSchema,
  attemptResponseSchema,
  checkpointSectionResponseSchema,
  checkpointsResponseSchema,
  exerciseAnswerResponseSchema,
  exerciseResponseSchema,
  type AnswerInput,
  type AttemptResponse,
  type ExerciseResponse,
} from '@forward-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { BOOK_KEY, lessonKey } from '../lesson/api';

export const CHECKPOINTS_KEY = ['checkpoints'] as const;
const sectionKey = (section: string) => ['checkpoints', section] as const;
const attemptKey = (id: string) => ['attempt', id] as const;
const exerciseKey = (id: string) => ['exercise', id] as const;
const ME_KEY = ['me'] as const;

const enc = encodeURIComponent;

export function useCheckpoints() {
  return useQuery({
    queryKey: CHECKPOINTS_KEY,
    queryFn: () => api('/api/checkpoints', { schema: checkpointsResponseSchema }),
  });
}

export function useCheckpointSection(section: string) {
  return useQuery({
    queryKey: sectionKey(section),
    queryFn: () =>
      api(`/api/checkpoints/${enc(section)}`, { schema: checkpointSectionResponseSchema }),
  });
}

export function useAttempt(id: string | null) {
  return useQuery({
    queryKey: attemptKey(id ?? ''),
    queryFn: () => api(`/api/attempts/${enc(id!)}`, { schema: attemptResponseSchema }),
    enabled: Boolean(id),
  });
}

/** Writes a fresh attempt into the cache; a finished one also refreshes every score that reads it. */
function useAttemptUpdate() {
  const queryClient = useQueryClient();
  return (state: AttemptResponse) => {
    queryClient.setQueryData(attemptKey(state.attempt.id), state);
    if (state.attempt.completedAt) {
      for (const key of [CHECKPOINTS_KEY, BOOK_KEY, ME_KEY]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    } else {
      void queryClient.invalidateQueries({ queryKey: sectionKey(state.section.number) });
    }
  };
}

export function useStartAttempt(section: string) {
  const update = useAttemptUpdate();
  return useMutation({
    mutationFn: () =>
      api(`/api/checkpoints/${enc(section)}/attempts`, {
        method: 'POST',
        schema: attemptResponseSchema,
      }),
    onSuccess: update,
  });
}

export function useAttemptAnswer(id: string) {
  const update = useAttemptUpdate();
  return useMutation({
    mutationFn: (body: { questionId: string; answer: AnswerInput; usedHint: boolean }) =>
      api(`/api/attempts/${enc(id)}/answers`, {
        method: 'POST',
        body,
        schema: attemptAnswerResponseSchema,
      }),
    onSuccess: (response) => update(response.state),
  });
}

export function useAttemptHint(id: string) {
  const update = useAttemptUpdate();
  return useMutation({
    mutationFn: (questionId: string) =>
      api(`/api/attempts/${enc(id)}/questions/${enc(questionId)}/hint`, {
        method: 'POST',
        schema: attemptResponseSchema,
      }),
    onSuccess: update,
  });
}

export function useFinishAttempt(id: string) {
  const update = useAttemptUpdate();
  return useMutation({
    mutationFn: () =>
      api(`/api/attempts/${enc(id)}/finish`, { method: 'POST', schema: attemptResponseSchema }),
    onSuccess: update,
  });
}

// ---------------------------------------------------------------------------------------------
// Exercises

export function useExercise(id: string) {
  return useQuery({
    queryKey: exerciseKey(id),
    queryFn: () => api(`/api/exercises/${enc(id)}`, { schema: exerciseResponseSchema }),
  });
}

function useExerciseUpdate(id: string) {
  const queryClient = useQueryClient();
  return (state: ExerciseResponse) => {
    queryClient.setQueryData(exerciseKey(id), state);
    void queryClient.invalidateQueries({ queryKey: lessonKey(state.section.id) });
    void queryClient.invalidateQueries({ queryKey: ME_KEY });
  };
}

export function useExerciseAnswer(id: string) {
  const update = useExerciseUpdate(id);
  return useMutation({
    mutationFn: (answer: AnswerInput) =>
      api(`/api/exercises/${enc(id)}/answers`, {
        method: 'POST',
        body: { answer },
        schema: exerciseAnswerResponseSchema,
      }),
    onSuccess: (response) => update(response.state),
  });
}

export function useRevealSolution(id: string) {
  const update = useExerciseUpdate(id);
  return useMutation({
    mutationFn: () =>
      api(`/api/exercises/${enc(id)}/reveal`, { method: 'POST', schema: exerciseResponseSchema }),
    onSuccess: update,
  });
}
