import { describe, it, expect } from 'vitest';
import {
  RoleSchema,
  PermissionSchema,
  RegisterRequestSchema,
  LoginRequestSchema,
  AuthUserSchema,
  AuthResponseSchema,
  ErrorResponseSchema,
} from './auth.js';
const user = {
  id: 'a4f6c280-d76f-4493-b1fd-2cbb011d2022',
  name: 'A',
  email: 'a@example.com',
  role: 'EMPLOYEE',
  permissions: ['INCIDENT_REPORT'],
};
const register = { name: 'A', email: 'a@example.com', password: 'password', department: 'IT' };
describe('auth contracts', () => {
  it.each([
    ['role', RoleSchema, 'ADMIN', 'BOGUS'],
    ['permission', PermissionSchema, 'CONFIG_MANAGE', 'BOGUS'],
    ['register', RegisterRequestSchema, register, { ...register, password: 'short' }],
    [
      'login',
      LoginRequestSchema,
      { email: 'a@example.com', password: 'x' },
      { email: 'bad', password: '' },
    ],
    ['user', AuthUserSchema, user, { ...user, id: 'bad' }],
    [
      'response',
      AuthResponseSchema,
      { accessToken: 'x', expiresIn: 3600, user },
      { accessToken: 'x', expiresIn: -1, user },
    ],
    [
      'error',
      ErrorResponseSchema,
      { error: { code: 'INVALID_INPUT', message: 'bad', details: { field: 'email' } } },
      { error: { code: 1 } },
    ],
  ])('%s validates valid and invalid values', (_name, schema, valid, invalid) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse(invalid).success).toBe(false);
  });
});
