import {
  apiErrorSchema,
  attemptResponseSchema,
  duelSchema,
  duelsResponseSchema,
  teachBackFormSchema,
} from '@forward-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError } from '../../api/client';

export const DUELS_KEY = ['duels'] as const;
const teachBackKey = (id: string) => ['teach-back', id] as const;
const enc = encodeURIComponent;

export function useDuels() {
  return useQuery({
    queryKey: DUELS_KEY,
    queryFn: () => api('/api/duels', { schema: duelsResponseSchema }),
  });
}

/** Any duel change can move Home's lists, the pod table and the lesson rail. */
function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [DUELS_KEY, ['home'], ['lesson']]) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useCreateDuel() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (sectionNumber: string) =>
      api('/api/duels', { method: 'POST', body: { sectionNumber }, schema: duelSchema }),
    onSuccess: refresh,
  });
}

export function useAcceptDuel() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/duels/${enc(id)}/accept`, { method: 'POST', schema: duelSchema }),
    onSuccess: refresh,
  });
}

/** Starts or resumes your duel attempt and caches it for the Checkpoint page. */
export function useStartDuelAttempt() {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/duels/${enc(id)}/attempt`, { method: 'POST', schema: attemptResponseSchema }),
    onSuccess: (state) => {
      queryClient.setQueryData(['attempt', state.attempt.id], state);
      refresh();
    },
  });
}

export function useTeachBack(id: string) {
  return useQuery({
    queryKey: teachBackKey(id),
    queryFn: () => api(`/api/duels/${enc(id)}/teach-back`, { schema: teachBackFormSchema }),
  });
}

export function useSaveTeachBack(id: string) {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (entries: { questionId: string; text: string }[]) =>
      api(`/api/duels/${enc(id)}/teach-back`, {
        method: 'PUT',
        body: { entries },
        schema: duelSchema,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teachBackKey(id) });
      refresh();
    },
  });
}

/** Uploads a recording as the raw request body; the API takes up to 5 MB of audio. */
export function useUploadTeachBackAudio(id: string) {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async (file: File) => {
      const res = await fetch(`/api/duels/${enc(id)}/teach-back/audio`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (!res.ok) {
        const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
        throw new ApiRequestError(
          res.status,
          parsed.success ? parsed.data.error : 'request_failed',
          parsed.success && parsed.data.message
            ? parsed.data.message
            : `Upload failed (${res.status}).`,
        );
      }
      return duelSchema.parse(await res.json());
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teachBackKey(id) });
      refresh();
    },
  });
}
