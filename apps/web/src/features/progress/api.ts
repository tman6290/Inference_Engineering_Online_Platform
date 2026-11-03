import {
  attemptResponseSchema,
  homeResponseSchema,
  progressPageSchema,
} from '@forward-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const HOME_KEY = ['home'] as const;
export const PROGRESS_KEY = ['progress'] as const;

export function useHome() {
  return useQuery({
    queryKey: HOME_KEY,
    queryFn: () => api('/api/home', { schema: homeResponseSchema }),
  });
}

export function useProgress() {
  return useQuery({
    queryKey: PROGRESS_KEY,
    queryFn: () => api('/api/progress', { schema: progressPageSchema }),
  });
}

/** Starts a recall attempt, or resumes the open one. */
export function useStartRecall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api('/api/recall/attempts', { method: 'POST', schema: attemptResponseSchema }),
    onSuccess: (state) => queryClient.setQueryData(['attempt', state.attempt.id], state),
  });
}
