export interface ValidatedIdentityAssertion {
  readonly issuer: string;
  readonly subject: string;
  readonly sessionId: string;
  readonly issuedAt: number;
  readonly expiresAt: number;
}
