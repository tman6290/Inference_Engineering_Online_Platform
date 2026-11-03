import type { DuelView, HomeResponse, TeachBackForm } from '@forward-pass/shared';

// A toy duel backend for page tests: a challenge on 5.2 that Friend lost and owes a teach-back on,
// and room for a new challenge from the pod table.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const friend = { id: 'u2', displayName: 'Friend', initial: 'F', colour: 'butter' as const };

function duel(overrides: Partial<DuelView>): DuelView {
  return {
    id: 'duel-1',
    section: { number: '5.2', title: 'Speculative Decoding' },
    status: 'open',
    role: 'challenger',
    partner: friend,
    createdAt: '2026-11-02T09:00:00.000Z',
    deadline: '2026-11-04T09:00:00.000Z',
    questionCount: 10,
    mine: { attemptId: 'attempt-9', finished: true, firstTryAccepted: 8, hints: 0 },
    theirs: { started: true, finished: false, firstTryAccepted: null, hints: null },
    outcome: null,
    teachBack: { owedBy: null, recorded: false },
    ...overrides,
  };
}

export function createFakePod({ owesTeachBack = false }: { owesTeachBack?: boolean } = {}) {
  const duels: DuelView[] = [];
  if (owesTeachBack) {
    duels.push(
      duel({
        id: 'duel-lost',
        status: 'complete',
        role: 'opponent',
        mine: { attemptId: 'a1', finished: true, firstTryAccepted: 6, hints: 1 },
        theirs: { started: true, finished: true, firstTryAccepted: 9, hints: 0 },
        outcome: 'lost',
        teachBack: { owedBy: 'me', recorded: false },
      }),
    );
  } else {
    duels.push(duel({}));
  }
  const saved: { entries: { questionId: string; text: string }[] | null } = { entries: null };

  const homeDuels = (): HomeResponse['duels'] => ({
    incoming: duels.filter((d) => d.status === 'pending' && d.role === 'opponent'),
    active: duels.filter(
      (d) => (d.status === 'pending' && d.role === 'challenger') || d.status === 'open',
    ),
    owed: duels.filter((d) => d.teachBack.owedBy === 'me' && !d.teachBack.recorded),
  });

  function handle(path: string, method: string, body: Record<string, unknown> | undefined) {
    if (path === '/api/duels' && method === 'GET') return json(200, { duels });
    if (path === '/api/duels' && method === 'POST') {
      const created = duel({
        id: `duel-${duels.length + 1}`,
        section: { number: String(body?.sectionNumber), title: 'Speculative Decoding' },
        status: 'pending',
        mine: { attemptId: null, finished: false, firstTryAccepted: null, hints: null },
        theirs: { started: false, finished: false, firstTryAccepted: null, hints: null },
      });
      duels.unshift(created);
      return json(201, created);
    }
    const teachBack = /^\/api\/duels\/([^/]+)\/teach-back$/.exec(path);
    if (teachBack) {
      const found = duels.find((d) => d.id === teachBack[1]);
      if (!found) return json(404, { error: 'not_found' });
      if (method === 'PUT') {
        saved.entries = (body?.entries as { questionId: string; text: string }[]) ?? [];
        const complete = saved.entries.length === 2 && saved.entries.every((e) => e.text.trim());
        found.teachBack = { ...found.teachBack, recorded: complete };
        return json(200, found);
      }
      const form: TeachBackForm = {
        duel: found,
        missed: [
          {
            questionId: '5.2-q1',
            prompt: 'Which metric does speculation improve?',
            explanation: 'Decode TPS.',
          },
          {
            questionId: '5.2-q5',
            prompt: 'How many tokens per pass at p = 0.8?',
            explanation: 'About 3.4.',
          },
        ],
        teachBack: null,
      };
      return json(200, form);
    }
    return null;
  }

  return { handle, homeDuels, duels, saved };
}
