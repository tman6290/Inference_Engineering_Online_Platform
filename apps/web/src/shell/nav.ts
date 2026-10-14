import type { ComponentType } from 'react';
import {
  BookIcon,
  CheckpointIcon,
  HomeIcon,
  ProgressIcon,
  ProjectIcon,
  SearchIcon,
  type IconProps,
} from '../ui';

export interface NavItem {
  label: string;
  to: string;
  icon: ComponentType<IconProps>;
  /** Other path prefixes that should mark this item active. */
  alsoActiveOn?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', to: '/', icon: HomeIcon },
  { label: 'The Book', to: '/book', icon: BookIcon },
  {
    label: 'Checkpoints',
    to: '/checkpoints',
    icon: CheckpointIcon,
    alsoActiveOn: ['/checkpoint/'],
  },
  { label: 'Projects', to: '/projects', icon: ProjectIcon },
  { label: 'Progress', to: '/progress', icon: ProgressIcon },
  { label: 'Glossary', to: '/glossary', icon: SearchIcon },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return true;
  return item.alsoActiveOn?.some((prefix) => pathname.startsWith(prefix)) ?? false;
}

/** Reading-focused routes collapse the sidebar to the icon rail. */
export function usesRail(pathname: string): boolean {
  return /^\/book\/[^/]+/.test(pathname) || /^\/checkpoint\/[^/]+/.test(pathname);
}
