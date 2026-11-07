/** Adapter boundary: implementations return only identities verified by the provider. */
export interface ExternalIdentity {
  email: string;
  name: string;
}
export interface IdentityProvider {
  readonly name: string;
  isConfigured(): boolean;
  createAuthorizationRequest(): { url: string; state: string; codeVerifier: string };
  exchangeCode(code: string, codeVerifier: string): Promise<ExternalIdentity>;
}
export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export class IdentityProviderException extends Error {
  constructor() {
    super('External identity could not be verified.');
    this.name = 'IdentityProviderException';
  }
}
export class AccountInactiveException extends Error {
  constructor() {
    super('Account is inactive.');
    this.name = 'AccountInactiveException';
  }
}
