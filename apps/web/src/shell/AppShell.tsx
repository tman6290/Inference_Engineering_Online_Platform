import { useEffect, useId, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { BoltIcon, CloseIcon, LogoMark, MenuIcon } from '../ui';
import { isNavItemActive, NAV_ITEMS, usesRail } from './nav';
import { placeholderPod, type PodMember } from './placeholderPod';
import { ThemeToggle } from './ThemeToggle';
import styles from './AppShell.module.css';

export function AppShell() {
  const { pathname } = useLocation();
  const rail = usesRail(pathname);

  return (
    <div className={styles.shell} data-rail={rail ? 'true' : undefined}>
      <a href="#main" className={styles.skipLink}>
        Skip to content
      </a>
      <TopBar pathname={pathname} />
      <aside className={styles.sidebar} data-surface="dark" aria-label="Sidebar">
        <Logo compact={rail} />
        <MainNav pathname={pathname} compact={rail} label="Main" />
        {rail ? null : <PodCard />}
        <div className={styles.sidebarFoot}>{rail ? <MeAvatar /> : <UptimeCard />}</div>
      </aside>
      <main id="main" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={styles.logo} aria-label={compact ? 'Forward Pass, home' : undefined}>
      <span className={styles.logoTile}>
        <LogoMark size={26} />
      </span>
      {compact ? null : (
        <span className={styles.logoText}>
          <span className={styles.logoName}>Forward Pass</span>
          <span className={styles.logoSub}>Inference Engineering</span>
        </span>
      )}
    </Link>
  );
}

interface MainNavProps {
  pathname: string;
  compact?: boolean;
  label: string;
}

function MainNav({ pathname, compact = false, label }: MainNavProps) {
  return (
    <nav aria-label={label}>
      <ul className={[styles.navList, compact ? styles.navListCompact : ''].join(' ')}>
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={[styles.navLink, compact ? styles.navLinkCompact : ''].join(' ')}
              >
                <Icon size={22} />
                <span className={compact ? 'visually-hidden' : undefined}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Avatar({ member, size = 'md' }: { member: PodMember; size?: 'sm' | 'md' }) {
  return (
    <span
      className={[styles.avatar, styles[member.colour], size === 'sm' ? styles.avatarSm : ''].join(
        ' ',
      )}
      aria-hidden="true"
    >
      {member.initial}
    </span>
  );
}

function PodCard() {
  const { me, partner, latestActivity } = placeholderPod;
  return (
    <div className={styles.podCard}>
      <h2 className={styles.cardEyebrow}>Study pod</h2>
      <div className={styles.podMembers}>
        <span className={styles.avatars}>
          <Avatar member={me} />
          <Avatar member={partner} />
        </span>
        <span>
          {me.name} &amp; {partner.name}
        </span>
      </div>
      <p className={styles.podActivity}>{latestActivity}</p>
    </div>
  );
}

function UptimeCard() {
  const days = placeholderPod.uptimeDays;
  return (
    <p className={styles.uptimeCard}>
      <BoltIcon size={24} className={styles.uptimeIcon} />
      <span className={styles.uptimeText}>
        <span className={styles.uptimeDays}>
          {days} {days === 1 ? 'day' : 'days'}
        </span>
        <span className={styles.uptimeLabel}>uptime streak</span>
      </span>
    </p>
  );
}

function MeAvatar() {
  const { me } = placeholderPod;
  return (
    <span className={styles.railAvatar}>
      <Avatar member={me} />
      <span className="visually-hidden">Signed in as {me.name}</span>
    </span>
  );
}

function TopBar({ pathname }: { pathname: string }) {
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenOn(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={styles.topBar} data-surface="dark">
      <div className={styles.topBarRow}>
        <Logo />
        <div className={styles.topBarActions}>
          <ThemeToggle className={styles.topBarToggle} />
          <button
            type="button"
            className={styles.menuButton}
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setOpenOn(open ? null : pathname)}
          >
            {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
            <span className="visually-hidden">Menu</span>
          </button>
        </div>
      </div>
      <div id={menuId} className={styles.drawer} hidden={!open}>
        {open ? (
          <>
            <MainNav pathname={pathname} label="Main menu" />
            <PodCard />
            <UptimeCard />
          </>
        ) : null}
      </div>
    </header>
  );
}
