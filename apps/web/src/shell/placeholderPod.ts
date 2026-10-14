// Stand-in data for the shell until the pod and uptime endpoints exist.

export interface PodMember {
  name: string;
  initial: string;
  /** Avatar fill: lime for you, butter for your study partner. */
  colour: 'lime' | 'butter';
}

export const placeholderPod = {
  me: { name: 'Tofa', initial: 'T', colour: 'lime' } satisfies PodMember,
  partner: { name: 'Friend', initial: 'F', colour: 'butter' } satisfies PodMember,
  latestActivity: 'Friend read 5.3 Caching 2h ago',
  uptimeDays: 14,
};
