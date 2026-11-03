import { READ_AT_SCROLL_PCT, type ReadingEventRequest } from '@forward-pass/shared';
import { useEffect, useRef } from 'react';

/** One write per this many milliseconds at most, as the build notes ask. */
export const READING_WRITE_INTERVAL_MS = 30_000;

/** How far down the page the reader has been, 0 to 100. */
function scrollPct(): number {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
}

/**
 * Tracks the furthest scroll on a lesson and reports a reading event at most every 30 s while
 * the page is visible, plus once when the page is hidden or left. `send` gets the event; on
 * page hide it falls back to `navigator.sendBeacon` so the last stretch isn't lost.
 */
export function useReadingTracker(
  lessonId: string,
  send: (event: ReadingEventRequest) => void,
  startPct = 0,
): void {
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  // Only the starting point at mount matters; later progress responses must not restart tracking.
  const startRef = useRef(startPct);

  useEffect(() => {
    const start = startRef.current;
    let max = Math.max(start, scrollPct());
    let sentMax = start;
    let windowStart = new Date();
    let lastWrite = 0;
    let pending: ReturnType<typeof setTimeout> | undefined;

    const event = (): ReadingEventRequest => ({
      startedAt: windowStart.toISOString(),
      endedAt: new Date().toISOString(),
      maxScrollPct: max,
    });

    const flush = (useBeacon = false) => {
      if (pending) clearTimeout(pending);
      pending = undefined;
      if (max <= sentMax && Date.now() - windowStart.getTime() < 1000) return;
      const body = event();
      if (useBeacon && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          `/api/lessons/${encodeURIComponent(lessonId)}/reading`,
          new Blob([JSON.stringify(body)], { type: 'application/json' }),
        );
      } else {
        sendRef.current(body);
      }
      sentMax = max;
      lastWrite = Date.now();
      windowStart = new Date();
    };

    const schedule = () => {
      if (pending || document.visibilityState !== 'visible') return;
      const wait = Math.max(0, READING_WRITE_INTERVAL_MS - (Date.now() - lastWrite));
      pending = setTimeout(() => flush(), wait);
    };

    const onScroll = () => {
      const pct = scrollPct();
      if (pct > max) {
        max = pct;
        // Crossing the "read" line is worth reporting at the next allowed write.
        if (max > sentMax) schedule();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true);
      else windowStart = new Date();
    };
    const onPageHide = () => flush(true);

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    // Short lessons may fit on screen without scrolling.
    if (max > sentMax) schedule();
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      flush();
    };
  }, [lessonId]);
}

export { READ_AT_SCROLL_PCT };
