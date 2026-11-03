export const IncidentAction = {
  classify: 'classify',
  assign: 'assign',
  acknowledge: 'acknowledge',
  startWork: 'startWork',
  addNote: 'addNote',
  requestInfo: 'requestInfo',
  provideInfo: 'provideInfo',
  resolve: 'resolve',
  verify: 'verify',
  reject: 'reject',
  close: 'close',
  closeAsDuplicate: 'closeAsDuplicate',
} as const;
export type IncidentAction = (typeof IncidentAction)[keyof typeof IncidentAction];
