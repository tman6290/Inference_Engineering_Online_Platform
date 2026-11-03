import {
  bookResponseSchema,
  checkResultSchema,
  lessonResponseSchema,
  noteResponseSchema,
  progressResponseSchema,
  type AnswerInput,
  type Confidence,
  type LessonResponse,
  type ProgressResponse,
  type ReadingEventRequest,
} from '@forward-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

export const lessonKey = (id: string) => ['lesson', id] as const;
export const BOOK_KEY = ['book'] as const;

export function useLesson(id: string) {
  return useQuery({
    queryKey: lessonKey(id),
    queryFn: () => api(`/api/lessons/${encodeURIComponent(id)}`, { schema: lessonResponseSchema }),
  });
}

export function useBook() {
  return useQuery({
    queryKey: BOOK_KEY,
    queryFn: () => api('/api/book', { schema: bookResponseSchema }),
  });
}

/** Folds new progress into the cached lesson, including its own row in the chapter outline. */
function applyProgress(lesson: LessonResponse, progress: ProgressResponse): LessonResponse {
  return {
    ...lesson,
    progress,
    chapter: lesson.chapter && {
      ...lesson.chapter,
      lessons: lesson.chapter.lessons.map((entry) =>
        entry.id === lesson.id ? { ...entry, readState: progress.readState } : entry,
      ),
    },
  };
}

function useProgressUpdate(id: string) {
  const queryClient = useQueryClient();
  return (progress: ProgressResponse) => {
    queryClient.setQueryData<LessonResponse>(lessonKey(id), (lesson) =>
      lesson ? applyProgress(lesson, progress) : lesson,
    );
    void queryClient.invalidateQueries({ queryKey: BOOK_KEY });
  };
}

export function useReadingEvent(id: string) {
  const update = useProgressUpdate(id);
  return useMutation({
    mutationFn: (event: ReadingEventRequest) =>
      api(`/api/lessons/${encodeURIComponent(id)}/reading`, {
        method: 'POST',
        body: event,
        schema: progressResponseSchema,
      }),
    onSuccess: update,
  });
}

export function useConfidence(id: string) {
  const update = useProgressUpdate(id);
  return useMutation({
    mutationFn: (level: Confidence) =>
      api(`/api/sections/${encodeURIComponent(id)}/confidence`, {
        method: 'PUT',
        body: { level },
        schema: progressResponseSchema,
      }),
    onSuccess: update,
  });
}

export function useSaveNote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api(`/api/lessons/${encodeURIComponent(id)}/note`, {
        method: 'PUT',
        body: { body },
        schema: noteResponseSchema,
      }),
    onSuccess: (note) =>
      queryClient.setQueryData<LessonResponse>(lessonKey(id), (lesson) =>
        lesson ? { ...lesson, note: note.body.trim() ? note : null } : lesson,
      ),
  });
}

export function useCheckAnswer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answer: AnswerInput) =>
      api(`/api/lessons/${encodeURIComponent(id)}/check`, {
        method: 'POST',
        body: answer,
        schema: checkResultSchema,
      }),
    onSuccess: (result) =>
      queryClient.setQueryData<LessonResponse>(lessonKey(id), (lesson) =>
        lesson
          ? {
              ...lesson,
              check: {
                ...result,
                // Once accepted, a lesson stays accepted even if a later try misses.
                accepted: result.accepted || Boolean(lesson.check?.accepted),
              },
            }
          : lesson,
      ),
  });
}
