import { describe, expect, it } from 'vitest';
import { asUserId } from '../shared/index.js';
import { Role } from '../users/index.js';
import { Actor } from './actor.js';
import { employee, reporterId } from './test-fixtures.js';

describe('Actor', () => {
  it('userCapturesUserIdentityAndRole', () => {
    const actor = Actor.user(employee);
    expect(actor.id).toBe(employee.id());
    expect(actor.role).toBe(employee.role());
    expect(actor.is(employee.id())).toBe(true);
    expect(actor.is(asUserId('someone-else'))).toBe(false);
    expect(actor.isSystem()).toBe(false);
    expect(Object.isFrozen(actor)).toBe(true);
  });
  it('ofCapturesExplicitIdentityAndRole', () => {
    expect(Actor.of(reporterId, Role.ADMIN)).toMatchObject({ id: reporterId, role: Role.ADMIN });
  });
  it('systemHasNoUserIdentity', () => {
    const actor = Actor.system();
    expect(actor.id).toBeNull();
    expect(actor.role).toBe('SYSTEM');
    expect(actor.isSystem()).toBe(true);
    expect(actor.is(reporterId)).toBe(false);
  });
});
