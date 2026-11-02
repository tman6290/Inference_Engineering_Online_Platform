import { describe, expect, it } from 'vitest';
import {
  countUnnumberedImages,
  countWords,
  firstSectionUsing,
  parseChapterIntro,
  parseGlossary,
  parseIndex,
  parseSection,
  readingMinutes,
  slugify,
  stripPageHeader,
} from '../src/book/parse';
import { BASE, INDEX_URL, pages } from './fixtures/book';

describe('parseIndex', () => {
  const entries = parseIndex(pages[INDEX_URL]!);

  it('keeps reading-order pages and drops the overview and full-text dump', () => {
    expect(entries.map((entry) => entry.path)).toEqual([
      'preface.md',
      '00-basics.md',
      '01-serving.md',
      '01-serving/1.1-batching.md',
      '01-serving/1.2-caching-results.md',
      'appendix-a-inference-glossary.md',
    ]);
  });

  it('classifies chapters, sections, front and back matter', () => {
    expect(entries[0]).toMatchObject({ kind: 'front', slug: 'preface', title: 'Preface' });
    expect(entries[1]).toMatchObject({
      kind: 'chapter',
      number: 0,
      slug: '00-basics',
      title: 'Basics',
    });
    expect(entries[3]).toMatchObject({
      kind: 'section',
      number: '1.1',
      chapterNumber: 1,
      slug: 'batching',
      title: 'Batching',
      summary: 'Grouping requests to share work.',
    });
    expect(entries[5]).toMatchObject({ kind: 'back', slug: 'appendix-a-inference-glossary' });
  });
});

describe('stripPageHeader', () => {
  it('removes the title and the copyright line', () => {
    const { title, body } = stripPageHeader(pages[`${BASE}/book/preface.md`]!);
    expect(title).toBe('Preface');
    expect(body).toMatch(
      /^This toy book exists so tests have something small and predictable to read./,
    );
  });
});

describe('parseSection', () => {
  const section = parseSection(pages[`${BASE}/book/01-serving/1.1-batching.md`]!, '1.1');

  it('splits the intro and subsections', () => {
    expect(section.title).toBe('Batching');
    expect(section.intro).toMatch(/^\*\*Batching\*\* groups/);
    expect(section.subsections.map((sub) => [sub.number, sub.title])).toEqual([
      ['1.1.1', 'Static Batches'],
      ['1.1.2', 'Continuous Batching'],
    ]);
    expect(section.subsections[0]!.markdown).not.toMatch(/^## /);
  });

  it('places figures in their subsection', () => {
    expect(section.figures).toEqual([
      {
        number: '1.1',
        caption: 'Four requests sharing one pass',
        sourceUrl: `${BASE}/assets/figure-1-1.png`,
        subsectionNumber: '1.1.1',
      },
    ]);
  });

  it('collects bold terms and counts words', () => {
    expect(section.boldTerms).toEqual(['Batching', 'batch size']);
    expect(section.wordCount).toBeGreaterThan(20);
  });

  it('does not mistake another section number for a subsection', () => {
    const other = parseSection(
      '# 1.2 X\n\n## 1.1.9 Not mine\n\ntext\n\n## 1.2.1 Mine\n\nmore',
      '1.2',
    );
    expect(other.subsections.map((sub) => sub.number)).toEqual(['1.2.1']);
  });
});

describe('parseChapterIntro', () => {
  it('stops at the first numbered section', () => {
    const { intro } = parseChapterIntro(pages[`${BASE}/book/01-serving.md`]!);
    expect(intro).toBe('Serving is where a toy model meets traffic.');
  });

  it('keeps the whole text and figures of a chapter without sections', () => {
    const { intro, figures } = parseChapterIntro(pages[`${BASE}/book/00-basics.md`]!);
    expect(intro).toMatch(/only has the right shape\.$/);
    expect(figures.map((figure) => figure.number)).toEqual(['0.1']);
  });
});

describe('parseGlossary', () => {
  const terms = parseGlossary(pages[`${BASE}/book/appendix-a-inference-glossary.md`]!);

  it('reads each bold term and its definition, joining wrapped lines', () => {
    expect(terms).toEqual([
      {
        term: 'Batching',
        slug: 'batching',
        definition: 'Grouping requests so one pass serves several of them.',
      },
      {
        term: 'KV cache',
        slug: 'kv-cache',
        definition: 'Stored keys and values from earlier tokens, reused on later steps.',
      },
      {
        term: 'Throughput (TPS)',
        slug: 'throughput-tps',
        definition: 'Tokens produced per second across all requests.',
      },
    ]);
  });
});

describe('firstSectionUsing', () => {
  const sections = [
    { number: '1.1', text: 'Continuous batching keeps the KV cache busy.' },
    { number: '1.2', text: 'Measure TPS under load. Throughput matters.' },
  ];

  it('finds the first section that uses a term, its base form or its acronym', () => {
    expect(firstSectionUsing('KV cache', sections)).toBe('1.1');
    expect(firstSectionUsing('Throughput (TPS)', sections)).toBe('1.2');
    expect(firstSectionUsing('Quantization', sections)).toBeNull();
  });

  it('matches whole words only', () => {
    expect(firstSectionUsing('Batch', [{ number: '1.1', text: 'batching' }])).toBeNull();
  });

  it('treats typographic dashes and plain hyphens as the same', () => {
    const text = [
      { number: '7.3', text: 'Run active-active across regions with cache-aware routing.' },
    ];
    expect(firstSectionUsing('Active–active', text)).toBe('7.3');
    expect(firstSectionUsing('Cache‑aware routing', text)).toBe('7.3');
  });

  it('prefers the section titled exactly with the term over an earlier mention', () => {
    const book = [
      { number: '4.3', title: 'Inference Engines', text: 'Engines support speculative decoding.' },
      { number: '5.2', title: 'Speculative Decoding', text: 'Draft tokens and validation.' },
      { number: '2.5', title: 'Optimizing Attention', text: 'Attention scales quadratically.' },
    ];
    expect(firstSectionUsing('Speculative decoding', book)).toBe('5.2');
    // A title that merely contains the term doesn't count.
    expect(
      firstSectionUsing('Attention', [
        { number: '2.2', title: 'LLM Mechanics', text: 'attention' },
        ...book,
      ]),
    ).toBe('2.2');
  });
});

describe('helpers', () => {
  it('slugifies terms', () => {
    expect(slugify('Active–active')).toBe('active-active');
    expect(slugify('Ada Lovelace (architecture)')).toBe('ada-lovelace-architecture');
  });

  it('counts words without image or link syntax', () => {
    expect(countWords('Two words ![Figure 1.1: x](http://a/b.png) [three](http://c)')).toBe(3);
  });

  it('rounds reading time to at least a minute', () => {
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(1150)).toBe(5);
  });

  it('counts images without a figure number', () => {
    expect(countUnnumberedImages(pages[`${BASE}/book/01-serving/1.2-caching-results.md`]!)).toBe(1);
  });
});
