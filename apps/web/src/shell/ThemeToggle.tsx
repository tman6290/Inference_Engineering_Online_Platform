import { useTheme } from '../theme/theme';
import { MoonIcon, SunIcon } from '../ui';
import styles from './ThemeToggle.module.css';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-pressed={dark}
      aria-label="Dark reading mode"
      className={[styles.toggle, className].filter(Boolean).join(' ')}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
