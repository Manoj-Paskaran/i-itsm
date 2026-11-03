import { describe, expect, it } from 'vitest';
import { AuditRecord } from './index.js';
import { asAuditId, asIncidentId, Instant } from '../shared/index.js';
import { InvalidInputException } from '../exceptions/index.js';
const props = {
  id: asAuditId('a'),
  at: Instant.of(0),
  actorId: null,
  action: 'created',
  incidentId: asIncidentId('i'),
  fromStatus: null,
  toStatus: 'NEW',
  description: 'Created',
};
describe('audit record', () => {
  it('rejects empty action', () =>
    expect(() => AuditRecord.create({ ...props, action: ' ' })).toThrow(InvalidInputException));
  it('rejects empty description', () =>
    expect(() => AuditRecord.create({ ...props, description: '' })).toThrow(InvalidInputException));
  it('round-trips snapshots', () => {
    const a = AuditRecord.create(props);
    expect(AuditRecord.rehydrate(a.toSnapshot()).toSnapshot()).toEqual(a.toSnapshot());
  });
});
