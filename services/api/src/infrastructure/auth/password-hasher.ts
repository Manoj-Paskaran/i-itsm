import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../../ports/index.js';
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, { algorithm: 2 });
  }
  verify(encoded: string, plain: string): Promise<boolean> {
    return verify(encoded, plain);
  }
}
