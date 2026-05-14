/**
 * JWT access / refresh token contracts. Concrete signing lives in the auth module when implemented.
 */
export type AccessTokenClaims = {
  sub: string;
  tenantId: string;
  roleIds: string[];
  typ: "access";
};

export type RefreshTokenClaims = {
  sub: string;
  sid: string;
  typ: "refresh";
};

export interface AccessTokenVerifier {
  verify(accessToken: string): Promise<AccessTokenClaims>;
}

export interface TokenIssuer {
  issueAccessToken(claims: Omit<AccessTokenClaims, "typ">): Promise<string>;
  issueRefreshToken(userId: string, sessionId: string): Promise<string>;
}
