import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { PlaceholderPage } from './pages/PlaceholderPage';
import './styles/global.css';

const queryClient = new QueryClient();

const router = createBrowserRouter([{ path: '*', element: <PlaceholderPage /> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
