import type { ReactNode, SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
  /** Gives the icon an accessible name. Without it the icon is decorative and hidden. */
  title?: string;
}

function createIcon(name: string, paths: ReactNode) {
  function Icon({ size = 20, title, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
        role={title ? 'img' : undefined}
        aria-hidden={title ? undefined : true}
        {...rest}
      >
        {title ? <title>{title}</title> : null}
        {paths}
      </svg>
    );
  }
  Icon.displayName = `${name}Icon`;
  return Icon;
}

export const HomeIcon = createIcon(
  'Home',
  <>
    <path d="M3.5 10.5 12 3.8l8.5 6.7" />
    <path d="M5.5 9v10.2a.8.8 0 0 0 .8.8H10v-5.5h4V20h3.7a.8.8 0 0 0 .8-.8V9" />
  </>,
);

export const BookIcon = createIcon(
  'Book',
  <>
    <path d="M4 4.5h5.5A2.5 2.5 0 0 1 12 7v13a2 2 0 0 0-2-2H4z" />
    <path d="M20 4.5h-5.5A2.5 2.5 0 0 0 12 7v13a2 2 0 0 1 2-2h6z" />
  </>,
);

export const CheckpointIcon = createIcon(
  'Checkpoint',
  <>
    <path d="M20 12.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9.5" />
    <path d="m8.5 11.5 3 3L20 6" />
  </>,
);

export const ProjectIcon = createIcon(
  'Project',
  <>
    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z" />
    <path d="m4 7.5 8 4.5 8-4.5" />
    <path d="M12 12v9" />
  </>,
);

export const ProgressIcon = createIcon(
  'Progress',
  <>
    <path d="M4 4v16h16" />
    <path d="m7.5 15 4-4.5 3 3L20 7" />
  </>,
);

export const SearchIcon = createIcon(
  'Search',
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.3-4.3" />
  </>,
);

export const ArrowRightIcon = createIcon(
  'ArrowRight',
  <>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </>,
);

export const ArrowLeftIcon = createIcon(
  'ArrowLeft',
  <>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </>,
);

export const MoonIcon = createIcon(
  'Moon',
  <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
);

export const SunIcon = createIcon(
  'Sun',
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </>,
);

export const BoltIcon = createIcon('Bolt', <path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z" />);

export const MenuIcon = createIcon('Menu', <path d="M4 7h16M4 12h16M4 17h16" />);

export const CloseIcon = createIcon('Close', <path d="M6 6l12 12M18 6 6 18" />);

export const CheckIcon = createIcon('Check', <path d="m5 12.5 4.5 4.5L19 7.5" />);

export const RetryIcon = createIcon(
  'Retry',
  <>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4.5h4.5" />
  </>,
);

export const LockIcon = createIcon(
  'Lock',
  <>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>,
);

export const NoteIcon = createIcon(
  'Note',
  <>
    <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5v9.5L14.5 19.5h-8A1.5 1.5 0 0 1 5 18z" />
    <path d="M9 9h6M9 12.5h4" />
  </>,
);

/** The Forward Pass mark: three lines feeding an arrow. Drawn on the lime tile. */
export const LogoMark = createIcon(
  'Logo',
  <>
    <path d="M4.5 7h10.5M4.5 12h15M4.5 17h7" strokeWidth={2.2} />
    <path d="m15.5 8 4 4-4 4" strokeWidth={2.2} />
  </>,
);
