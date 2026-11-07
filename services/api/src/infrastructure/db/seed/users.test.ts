import { describe, expect, it } from 'vitest';
import { buildSeedUsers, parseDemoEmailOverride } from './users.js';

describe('demo email override', () => {
  it('seedOverrideRewritesExactlyOneUser', () => {
    const original = buildSeedUsers();
    const users = buildSeedUsers(parseDemoEmailOverride('priya@itsm.demo=you@example.com'));
    expect(users).toHaveLength(15);
    expect(users.filter((user, index) => user.email !== original[index]!.email)).toEqual([
      { ...original[0], email: 'you@example.com' },
    ]);
    expect(users).toEqual(
      original.map((user) => ({
        ...user,
        email: user.email === 'priya@itsm.demo' ? 'you@example.com' : user.email,
      })),
    );
    expect(buildSeedUsers()).toEqual(original);
  });
  it.each([undefined, '', '   '])('seedOverrideLeavesUsersUnchangedWhenUnset (%s)', (value) => {
    expect(parseDemoEmailOverride(value)).toBeUndefined();
    expect(buildSeedUsers(parseDemoEmailOverride(value))).toEqual(buildSeedUsers());
  });
  it('seedOverrideNormalizesEmailAddresses', () => {
    expect(parseDemoEmailOverride(' PRIYA@ITSM.DEMO = YOU@EXAMPLE.COM ')).toEqual({
      from: 'priya@itsm.demo',
      to: 'you@example.com',
    });
  });
  it.each([
    'priya@itsm.demo',
    '=you@example.com',
    'priya@itsm.demo=',
    ' = ',
    'priya=you@example.com',
    'priya@itsm.demo=not-an-email',
    'priya@itsm.demo=you@example.com=other@example.com',
    'priya@itsm.demo=you@example.com,other@example.com',
  ])('seedOverrideRejectsMalformedValue (%s)', (value) => {
    expect(() => parseDemoEmailOverride(value)).toThrow(
      'DEMO_EMAIL_OVERRIDE must look like seed@itsm.demo=you@example.com',
    );
  });
  it.each(['unknown@itsm.demo=you@example.com', 'seed@example.com=you@example.com'])(
    'seedOverrideRejectsUnknownSeedEmail (%s)',
    (value) => {
      expect(() => parseDemoEmailOverride(value)).toThrow(/source must be a seeded user/);
    },
  );
});
