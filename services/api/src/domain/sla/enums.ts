export const SlaKind = { RESPONSE: 'RESPONSE', RESOLUTION: 'RESOLUTION' } as const;
export type SlaKind = (typeof SlaKind)[keyof typeof SlaKind];

export const SlaStatus = {
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  BREACHED: 'BREACHED',
  MET: 'MET',
  PAUSED: 'PAUSED',
} as const;
export type SlaStatus = (typeof SlaStatus)[keyof typeof SlaStatus];
