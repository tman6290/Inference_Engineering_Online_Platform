import type { Figure } from '@forward-pass/shared';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './BookMarkdown.module.css';

interface BookMarkdownProps {
  markdown: string;
  /** The lesson's figures; images captioned "Figure N.M" are served from these, not the web. */
  figures?: Figure[];
  className?: string;
}

// The published pages repeat each caption as an italic line under the image. The figure
// element below shows the caption once, so the repeat is dropped.
const CAPTION_LINE = /^_Figure (?:\d+|P)\.\d+:[^\n]*_\s*$/gm;

/** Book text rendered safely: no raw HTML, figures swapped for the locally ingested images. */
export function BookMarkdown({ markdown, figures = [], className }: BookMarkdownProps) {
  const byNumber = new Map(figures.map((figure) => [figure.number, figure]));
  const components: Components = {
    img({ alt = '' }) {
      const number = /^Figure ((?:\d+|P)\.\d+)/.exec(alt)?.[1];
      const figure = number ? byNumber.get(number) : undefined;
      if (!figure) return null;
      return (
        <span className={styles.figure} role="figure" aria-label={`Figure ${figure.number}`}>
          <img src={figure.url} alt={figure.caption} loading="lazy" className={styles.image} />
          <span className={styles.caption}>
            <span className={styles.figureNumber}>Figure {figure.number}</span> {figure.caption}
          </span>
        </span>
      );
    },
    a({ href, children }) {
      const external = href ? /^https?:/i.test(href) : false;
      return (
        <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {children}
        </a>
      );
    },
    // Book headings sit below the page's own h1, so shift them down one level.
    h1: ({ children }) => <h2>{children}</h2>,
    h2: ({ children }) => <h3>{children}</h3>,
    h3: ({ children }) => <h4>{children}</h4>,
    table: ({ children }) => (
      // Focusable so keyboard users can scroll a table wider than the screen.
      <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Table from the book">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className={[styles.prose, className].filter(Boolean).join(' ')}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown.replace(CAPTION_LINE, '')}
      </Markdown>
    </div>
  );
}
