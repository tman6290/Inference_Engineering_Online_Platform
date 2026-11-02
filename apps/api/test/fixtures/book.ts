// A tiny made-up book with the same shape as the published one: an llms.txt index, a preface,
// a Chapter 0 with no sections, a chapter with two sections, and a glossary appendix.
// Synthetic text only; the real book never enters git.

export const BASE = 'https://books.example/toy';
export const INDEX_URL = `${BASE}/llms.txt`;

const header = (title: string) =>
  `# ${title}\n\n_Inference Engineering_ by Test Author. © 2026 Example. [Full book index](${BASE}/llms.txt)\n`;

export const pages: Record<string, string> = {
  [INDEX_URL]: `# Toy Book

> A made-up book for tests.

- [Expanded table of contents](${BASE}/book/overview.md): Everything at a glance.

## Start Here

- [Preface](${BASE}/book/preface.md): Why the toy book exists.
- [Chapter 0: Basics](${BASE}/book/00-basics.md): The smallest possible introduction.

## Chapter 1: Serving

- [Chapter 1: Serving](${BASE}/book/01-serving.md): How toy models get served.
- [1.1 Batching](${BASE}/book/01-serving/1.1-batching.md): Grouping requests to share work.
- [1.2 Caching Results](${BASE}/book/01-serving/1.2-caching-results.md): Keeping answers you already computed.

## Appendices

- [Appendix A: Inference Glossary](${BASE}/book/appendix-a-inference-glossary.md): Terms used in the toy book.

## Optional

- [Complete book text](${BASE}/llms-full.txt): Everything in one file.
`,
  [`${BASE}/book/preface.md`]: `${header('Preface')}
This toy book exists so tests have something small and predictable to read.

![Figure P.1: Why toys help](${BASE}/assets/figure-p-1.png)
`,
  [`${BASE}/book/00-basics.md`]: `${header('Chapter 0: Basics')}
A toy model turns a prompt into tokens, one step at a time.

![Figure 0.1: A toy model reading a prompt](${BASE}/assets/figure-0-1.png)

Nothing here is real; it only has the right shape.
`,
  [`${BASE}/book/01-serving.md`]: `${header('Chapter 1: Serving')}
Serving is where a toy model meets traffic.

## 1.1 Batching

Batching text repeated in the chapter file.

## 1.2 Caching Results

Caching text repeated in the chapter file.
`,
  [`${BASE}/book/01-serving/1.1-batching.md`]: `${header('1.1 Batching')}
**Batching** groups several requests so one forward pass serves them all.

## 1.1.1 Static Batches

A static batch waits until it is full. The **batch size** sets throughput.

![Figure 1.1: Four requests sharing one pass](${BASE}/assets/figure-1-1.png)

## 1.1.2 Continuous Batching

Continuous batching adds requests as others finish, so the KV cache stays busy.
`,
  [`${BASE}/book/01-serving/1.2-caching-results.md`]: `${header('1.2 Caching Results')}
Caching keeps work you already did.

![Diagram without a figure number](${BASE}/assets/loose.png)

## 1.2.1 Prefix Reuse

A shared prefix is computed once and reused.

![Figure 1.2: Two prompts sharing a prefix](${BASE}/assets/figure-1-2.jpg)
`,
  [`${BASE}/book/appendix-a-inference-glossary.md`]: `${header('Appendix A: Inference Glossary')}
This appendix lists toy terms.

**Batching:** Grouping requests so one pass serves several of them.

**KV cache:** Stored keys and values from earlier tokens,
reused on later steps.

**Throughput (TPS):** Tokens produced per second across all requests.
`,
};

/** A valid 1×1 PNG. */
export const PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
);

export function fixtureFetcher() {
  const calls: string[] = [];
  return {
    calls,
    async text(url: string) {
      calls.push(url);
      const body = pages[url];
      if (body === undefined) throw new Error(`no fixture for ${url}`);
      return body;
    },
    async bytes(url: string) {
      calls.push(url);
      return PNG;
    },
  };
}
