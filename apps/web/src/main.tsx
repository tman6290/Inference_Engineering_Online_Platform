import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { retryDelay, retryTransient } from './api/client';
import { AuthProvider } from './auth/auth';
import { buildRoutes } from './routes';
import { ThemeProvider } from './theme/theme';
import './styles/global.css';

// Retry only failures that may pass on their own (a waking API host), never the API's own answers.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryTransient, retryDelay } },
});

const router = createBrowserRouter(buildRoutes({ devRoutes: import.meta.env.DEV }));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
