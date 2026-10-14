import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { LoginPage } from './pages/LoginPage';
import {
  BookPage,
  CheckpointPage,
  CheckpointsPage,
  GlossaryPage,
  HomePage,
  NotFoundPage,
  ProgressPage,
  ProjectPage,
  ProjectsPage,
  SectionPage,
} from './pages/pages';
import { AppShell } from './shell/AppShell';

// Dev builds only. In production the branch is dead code, so the showcase never ships.
const LazyDevUiPage = import.meta.env.DEV
  ? lazy(() => import('./pages/DevUiPage').then((module) => ({ default: module.DevUiPage })))
  : null;

interface RouteOptions {
  /** Mount /dev/ui. On in development, off in production builds. */
  devRoutes?: boolean;
}

export function buildRoutes({ devRoutes = false }: RouteOptions = {}): RouteObject[] {
  const devUi: RouteObject[] =
    devRoutes && LazyDevUiPage
      ? [
          {
            path: 'dev/ui',
            element: (
              <Suspense fallback={null}>
                <LazyDevUiPage />
              </Suspense>
            ),
          },
        ]
      : [];

  return [
    { path: '/login', element: <LoginPage /> },
    {
      path: '/',
      element: <AppShell />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'book', element: <BookPage /> },
        { path: 'book/:sectionId', element: <SectionPage /> },
        { path: 'checkpoints', element: <CheckpointsPage /> },
        { path: 'checkpoint/:sectionId', element: <CheckpointPage /> },
        { path: 'projects', element: <ProjectsPage /> },
        { path: 'projects/:slug', element: <ProjectPage /> },
        { path: 'progress', element: <ProgressPage /> },
        { path: 'glossary', element: <GlossaryPage /> },
        ...devUi,
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
