import { searchResponseSchema, type SearchResult } from '@forward-pass/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../api/client';
import { CloseIcon, SearchIcon } from '../../ui';
import styles from './SearchDialog.module.css';

const DEBOUNCE_MS = 120;

function useSearch(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  return useQuery({
    queryKey: ['search', debounced],
    queryFn: () =>
      api(`/api/search?q=${encodeURIComponent(debounced)}`, { schema: searchResponseSchema }),
    enabled: debounced.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * A modal search box: a combobox over grouped results. Arrow keys move through every result,
 * Enter opens one and Escape closes the dialog, handing focus back to whatever opened it.
 */
export function SearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const ids = { title: useId(), listbox: useId(), status: useId(), option: useId() };
  const results = useSearch(query);

  const groups = query.trim() ? (results.data?.groups ?? []) : [];
  const flat: SearchResult[] = groups.flatMap((group) => group.results);
  const optionId = (index: number) => `${ids.option}-${index}`;
  const current = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const open = (result: SearchResult) => {
    onClose();
    void navigate(result.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'Tab') {
      // Two stops only: the input and the close button.
      event.preventDefault();
      (document.activeElement === inputRef.current ? closeRef : inputRef).current?.focus();
    } else if (event.target === inputRef.current && flat.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((index) => (Math.min(index, flat.length - 1) + 1) % flat.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((index) => (Math.min(index, flat.length - 1) - 1 + flat.length) % flat.length);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        open(flat[current]!);
      }
    }
  };

  // Keep the highlighted option in view as the arrows move it.
  useEffect(() => {
    document.getElementById(optionId(current))?.scrollIntoView?.({ block: 'nearest' });
  });

  const count = flat.length;
  const status = !query.trim()
    ? 'Type to search sections, glossary terms and exercises.'
    : results.isFetching && !results.data
      ? 'Searching…'
      : count
        ? `${count} ${count === 1 ? 'result' : 'results'}. Use the arrow keys to pick one.`
        : `Nothing matches “${query.trim()}”.`;

  // Each group's first option index, so options number straight through every group.
  const offsets = groups.map((_, at) =>
    groups.slice(0, at).reduce((sum, group) => sum + group.results.length, 0),
  );
  return (
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.title}
        className={styles.dialog}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id={ids.title} className="visually-hidden">
          Search
        </h2>
        <div className={styles.field}>
          <SearchIcon size={20} className={styles.icon} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label="Search the book, glossary and exercises"
            aria-expanded={count > 0}
            aria-controls={ids.listbox}
            aria-autocomplete="list"
            aria-activedescendant={count ? optionId(current) : undefined}
            aria-describedby={ids.status}
            autoComplete="off"
            spellCheck={false}
            placeholder="Search the book or glossary…"
            className={styles.input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
            <CloseIcon size={18} />
            <span className="visually-hidden">Close search</span>
          </button>
        </div>

        <div id={ids.listbox} role="listbox" aria-label="Search results" className={styles.results}>
          {groups.map((group, at) => (
            <div key={group.type} role="group" aria-labelledby={`${ids.listbox}-${group.type}`}>
              <div
                id={`${ids.listbox}-${group.type}`}
                role="presentation"
                className={styles.groupLabel}
              >
                {group.label}
              </div>
              {group.results.map((result, within) => {
                const mine = offsets[at]! + within;
                return (
                  <div
                    key={`${result.type}-${result.id}`}
                    id={optionId(mine)}
                    role="option"
                    aria-selected={mine === current}
                    className={styles.option}
                    onMouseMove={() => setActive(mine)}
                    onClick={() => open(result)}
                  >
                    <span className={styles.optionTitle}>{result.title}</span>
                    {result.subtitle ? (
                      <span className={styles.optionSubtitle}>{result.subtitle}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p id={ids.status} className={styles.status} role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );
}
