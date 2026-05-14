/**
 * Server-side session handle (DB-backed or cache-backed). Implementations belong in the auth module.
 */
export type SessionRecord = {
  id: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export interface SessionRepository {
  createSession(input: {
    userId: string;
    tenantId: string;
    expiresAt: Date;
  }): Promise<SessionRecord>;
  revokeSession(sessionId: string): Promise<void>;
}
