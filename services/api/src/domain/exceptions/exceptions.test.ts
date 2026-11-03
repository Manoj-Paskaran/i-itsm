import { describe, it, expect } from 'vitest';
import * as E from './index.js';
const cause = new Error('underlying');
const cases = [
  [new E.InvalidTokenException(), E.SecurityException, 'unauthenticated', 'INVALID_TOKEN', {}],
  [
    new E.ConcurrentModificationException('i'),
    E.BusinessRuleException,
    'conflict',
    'CONCURRENT_MODIFICATION',
    { incidentId: 'i' },
  ],
  [
    new E.InvalidStateTransitionException('NEW', 'close'),
    E.BusinessRuleException,
    'conflict',
    'INVALID_STATE_TRANSITION',
    { from: 'NEW', action: 'close' },
  ],
  [
    new E.InvalidIncidentException('bad'),
    E.BusinessRuleException,
    'rule',
    'INVALID_INCIDENT',
    { reason: 'bad' },
  ],
  [
    new E.DuplicateIncidentException('i'),
    E.BusinessRuleException,
    'conflict',
    'DUPLICATE_INCIDENT',
    { existingIncidentId: 'i' },
  ],
  [
    new E.TechnicianUnavailableException('away'),
    E.BusinessRuleException,
    'conflict',
    'TECHNICIAN_UNAVAILABLE',
    { reason: 'away' },
  ],
  [
    new E.WorkloadExceededException('t', 2, 2),
    E.BusinessRuleException,
    'conflict',
    'WORKLOAD_EXCEEDED',
    { technicianId: 't', active: 2, max: 2 },
  ],
  [
    new E.MissingSlaConfigurationException('s', 'P1'),
    E.BusinessRuleException,
    'rule',
    'MISSING_SLA_CONFIGURATION',
    { serviceId: 's', priority: 'P1' },
  ],
  [
    new E.ServiceNotFoundException('s'),
    E.NotFoundException,
    'not_found',
    'SERVICE_NOT_FOUND',
    { serviceId: 's' },
  ],
  [
    new E.ConfigItemNotFoundException('Category', 'c'),
    E.NotFoundException,
    'not_found',
    'CONFIG_ITEM_NOT_FOUND',
    { itemKind: 'Category', id: 'c' },
  ],
  [
    new E.IncidentNotFoundException('i'),
    E.NotFoundException,
    'not_found',
    'INCIDENT_NOT_FOUND',
    { incidentId: 'i' },
  ],
  [
    new E.InvalidCredentialsException(),
    E.SecurityException,
    'unauthenticated',
    'INVALID_CREDENTIALS',
    {},
  ],
  [
    new E.UnauthorizedOperationException('EMPLOYEE', 'WORK'),
    E.SecurityException,
    'forbidden',
    'UNAUTHORIZED_OPERATION',
    { actorRole: 'EMPLOYEE', permission: 'WORK' },
  ],
  [
    new E.InvalidInputException('bad', { field: 'x', value: 4 }),
    E.ItsmException,
    'validation',
    'INVALID_INPUT',
    { field: 'x', value: 4 },
  ],
  [
    new E.DatabaseFailureException(cause),
    E.InfrastructureException,
    'unavailable',
    'DATABASE_FAILURE',
    {},
  ],
  [
    new E.NetworkFailureException('ml', cause),
    E.InfrastructureException,
    'unavailable',
    'NETWORK_FAILURE',
    { target: 'ml' },
  ],
] as const;
describe('exception hierarchy', () => {
  it.each(cases)('preserves metadata for %s', (error, parent, kind, code, details) => {
    expect(error).toBeInstanceOf(parent);
    expect(error).toBeInstanceOf(E.ItsmException);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe(kind);
    expect(error.code).toBe(code);
    expect(error.details).toEqual(details);
    expect(error.name).toBe(error.constructor.name);
    expect(error.message).toBeTruthy();
  });
  it('preserves infrastructure causes', () => {
    expect(new E.DatabaseFailureException(cause).cause).toBe(cause);
    expect(new E.NetworkFailureException('ml', cause).cause).toBe(cause);
  });
  it('includes a supplied reason in technician unavailable messages', () => {
    expect(new E.TechnicianUnavailableException('on leave').message).toMatch(/on leave/);
    expect(new E.TechnicianUnavailableException().message).toMatch(/unavailable/i);
  });
});
