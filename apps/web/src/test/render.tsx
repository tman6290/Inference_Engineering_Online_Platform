import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { buildRoutes } from '../routes';
import { ThemeProvider } from '../theme/theme';

export function renderRoute(path: string) {
  document.documentElement.lang = 'en';
  document.title = 'Forward Pass';
  const router = createMemoryRouter(buildRoutes({ devRoutes: true }), { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

/** Runs axe over the whole document and returns readable violation summaries. */
export async function axeViolations(): Promise<string[]> {
  const results = await axe.run(document, { resultTypes: ['violations'] });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')})`,
  );
}
