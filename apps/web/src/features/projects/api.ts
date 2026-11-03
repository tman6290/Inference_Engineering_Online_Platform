import {
  apiErrorSchema,
  projectDetailSchema,
  projectsResponseSchema,
  submissionDetailSchema,
  submissionSummarySchema,
  type CreateSubmissionRequest,
} from '@forward-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiRequestError } from '../../api/client';

const enc = encodeURIComponent;
const projectKey = (slug: string) => ['project', slug] as const;

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => api('/api/projects', { schema: projectsResponseSchema }),
  });
}

export function useProject(slug: string) {
  return useQuery({
    queryKey: projectKey(slug),
    queryFn: () => api(`/api/projects/${enc(slug)}`, { schema: projectDetailSchema }),
  });
}

/** Polls while the runner and the critique work, then stops. */
export function useSubmission(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['submission', id],
    queryFn: async () => {
      const detail = await api(`/api/submissions/${enc(id!)}`, { schema: submissionDetailSchema });
      if (['graded', 'failed'].includes(detail.status)) {
        void queryClient.invalidateQueries({ queryKey: projectKey(detail.projectSlug) });
      }
      return detail;
    },
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && ['graded', 'failed'].includes(query.state.data.status) ? false : 4000,
  });
}

async function upload(id: string, file: File) {
  const res = await fetch(`/api/submissions/${enc(id)}/files/${enc(file.name)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
    throw new ApiRequestError(
      res.status,
      parsed.success ? parsed.data.error : 'upload_failed',
      `${file.name}: ${parsed.success && parsed.data.message ? parsed.data.message : `upload failed (${res.status})`}`,
    );
  }
}

/** Creates the submission, then uploads any files beside it. */
export function useSubmit(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ body, files }: { body: CreateSubmissionRequest; files: File[] }) => {
      const created = await api(`/api/projects/${enc(slug)}/submissions`, {
        method: 'POST',
        body,
        schema: submissionSummarySchema,
      });
      for (const file of files) await upload(created.id, file);
      return created;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: projectKey(slug) });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
