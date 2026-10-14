import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { buildRoutes } from './routes';
import { ThemeProvider } from './theme/theme';
import './styles/global.css';

const queryClient = new QueryClient();

const router = createBrowserRouter(buildRoutes({ devRoutes: import.meta.env.DEV }));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
