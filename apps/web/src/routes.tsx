import { lazy, Suspense } from 'react';
import type { RouteObject } from 'react-router';
import { CHANGE_PASSWORD_PATH, RequireAuth } from './auth/RequireAuth';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { LoginPage } from './pages/LoginPage';
import { BookPage } from './pages/BookPage';
import { CheckpointPage } from './pages/CheckpointPage';
import { CheckpointsPage } from './pages/CheckpointsPage';
import { ExercisePage } from './pages/ExercisePage';
import { GlossaryPage } from './pages/GlossaryPage';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';
import { ProgressPage } from './pages/ProgressPage';
import { RecallPage } from './pages/RecallPage';
import { TeachBackPage } from './pages/TeachBackPage';
import { NotFoundPage, ProjectPage, ProjectsPage } from './pages/pages';
import { RegisterPage } from './pages/RegisterPage';
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
    { path: '/register', element: <RegisterPage /> },
    {
      path: CHANGE_PASSWORD_PATH,
      element: (
        <RequireAuth>
          <ChangePasswordPage />
        </RequireAuth>
      ),
    },
    {
      path: '/',
      element: (
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      ),
      children: [
        { index: true, element: <HomePage /> },
        { path: 'book', element: <BookPage /> },
        { path: 'book/:sectionId', element: <LessonPage /> },
        { path: 'book/:sectionId/exercises/:exerciseId', element: <ExercisePage /> },
        { path: 'checkpoints', element: <CheckpointsPage /> },
        { path: 'checkpoint/:sectionId', element: <CheckpointPage /> },
        { path: 'projects', element: <ProjectsPage /> },
        { path: 'projects/:slug', element: <ProjectPage /> },
        { path: 'progress', element: <ProgressPage /> },
        { path: 'recall', element: <RecallPage /> },
        { path: 'duels/:duelId/teach-back', element: <TeachBackPage /> },
        { path: 'glossary', element: <GlossaryPage /> },
        ...devUi,
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
