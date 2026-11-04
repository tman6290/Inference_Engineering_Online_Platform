import {
  caseStudySchema,
  portfolioResponseSchema,
  publicProfileSchema,
  type PortfolioResponse,
  type PortfolioSettingsRequest,
} from '@forward-pass/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';

const enc = encodeURIComponent;
const portfolioKey = ['portfolio'] as const;

export const caseStudyPath = (username: string, slug: string) => `/p/${enc(username)}/${enc(slug)}`;
export const pdfUrl = (submissionId: string) =>
  `/api/submissions/${enc(submissionId)}/case-study.pdf`;

export function usePortfolio() {
  return useQuery({
    queryKey: portfolioKey,
    queryFn: () => api('/api/portfolio', { schema: portfolioResponseSchema }),
  });
}

/** Saving settings or visibility returns the fresh portfolio; projects and Home read it too. */
function useAfterPortfolioChange() {
  const queryClient = useQueryClient();
  return (data: PortfolioResponse) => {
    queryClient.setQueryData(portfolioKey, data);
    void queryClient.invalidateQueries({ queryKey: ['project'] });
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
  };
}

export function useSaveSettings() {
  const onSuccess = useAfterPortfolioChange();
  return useMutation({
    mutationFn: (body: PortfolioSettingsRequest) =>
      api('/api/portfolio/settings', { method: 'PUT', body, schema: portfolioResponseSchema }),
    onSuccess,
  });
}

export function useSetVisibility() {
  const onSuccess = useAfterPortfolioChange();
  return useMutation({
    mutationFn: ({ submissionId, isPublic }: { submissionId: string; isPublic: boolean }) =>
      api(`/api/submissions/${enc(submissionId)}/visibility`, {
        method: 'POST',
        body: { public: isPublic },
        schema: portfolioResponseSchema,
      }),
    onSuccess,
  });
}

export function usePublicProfile(username: string) {
  return useQuery({
    queryKey: ['public', username],
    queryFn: () => api(`/api/public/${enc(username)}`, { schema: publicProfileSchema }),
  });
}

export function useCaseStudy(username: string, slug: string) {
  return useQuery({
    queryKey: ['public', username, slug],
    queryFn: () => api(`/api/public/${enc(username)}/${enc(slug)}`, { schema: caseStudySchema }),
  });
}
