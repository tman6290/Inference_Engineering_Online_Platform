import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { SearchIcon } from '../../ui';
import { SearchDialog } from './SearchDialog';
import styles from './search.module.css';

const SearchContext = createContext<{ open: () => void } | null>(null);

/** True on Apple platforms, where the shortcut reads ⌘K. */
const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Owns the search dialog and the Ctrl+K / ⌘K shortcut for every signed-in page. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SearchContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      {isOpen ? <SearchDialog onClose={() => setOpen(false)} /> : null}
    </SearchContext.Provider>
  );
}

export function useOpenSearch(): () => void {
  return useContext(SearchContext)?.open ?? (() => undefined);
}

/** The wide field from the Home board. It opens the dialog rather than searching in place. */
export function SearchField() {
  const open = useOpenSearch();
  return (
    <button
      type="button"
      className={styles.field}
      onClick={open}
      aria-keyshortcuts="Control+K Meta+K"
    >
      <SearchIcon size={20} className={styles.icon} />
      <span className={styles.placeholder}>Search the book or glossary…</span>
      <kbd className={styles.kbd}>{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}

/** An icon-only trigger for the compact rail and the phone top bar. */
export function SearchButton({ className }: { className?: string }) {
  const open = useOpenSearch();
  return (
    <button
      type="button"
      className={[styles.iconButton, className].filter(Boolean).join(' ')}
      onClick={open}
      aria-keyshortcuts="Control+K Meta+K"
    >
      <SearchIcon size={22} />
      <span className="visually-hidden">Search</span>
    </button>
  );
}
