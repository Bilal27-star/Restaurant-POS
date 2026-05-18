import { createHash } from "node:crypto";

import type { PrismaClient, RoleCode, User, UserStatus } from "@prisma/client";

import { prisma } from "../../prisma/index.js";

export type UserWithAuthRelations = User & {
  roles: {
    role: {
      code: RoleCode;
      permissions: { permission: { code: string } }[];
    };
  }[];
};

export function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export class AuthRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  findRestaurantBySlug(slug: string) {
    return this.db.restaurant.findFirst({
      where: { slug: { equals: slug, mode: "insensitive" }, deletedAt: null },
      select: { id: true, name: true, slug: true },
    });
  }

  findUserForAuth(restaurantId: string, usernameOrEmail: string): Promise<UserWithAuthRelations | null> {
    const term = usernameOrEmail.trim();
    return this.db.user.findFirst({
      where: {
        restaurantId,
        deletedAt: null,
        OR: [
          { username: { equals: term, mode: "insensitive" } },
          { email: { equals: term, mode: "insensitive" } },
        ],
      },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    }) as Promise<UserWithAuthRelations | null>;
  }

  findUserByIdWithRoles(userId: string): Promise<UserWithAuthRelations | null> {
    return this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: { select: { code: true } } },
                },
              },
            },
          },
        },
      },
    }) as Promise<UserWithAuthRelations | null>;
  }

  findSessionById(sessionId: string) {
    return this.db.session.findFirst({
      where: { id: sessionId, revokedAt: null },
    });
  }

  findSessionByTokenHash(tokenHash: string) {
    return this.db.session.findFirst({
      where: { tokenHash, revokedAt: null },
    });
  }

  createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    userAgent?: string | null;
    ipAddress?: string | null;
    expiresAt: Date;
  }) {
    return this.db.session.create({
      data: {
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
        expiresAt: input.expiresAt,
      },
    });
  }

  updateSessionToken(sessionId: string, tokenHash: string, expiresAt: Date) {
    return this.db.session.update({
      where: { id: sessionId },
      data: { tokenHash, expiresAt },
    });
  }

  revokeSession(sessionId: string) {
    return this.db.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllSessionsForUser(userId: string) {
    return this.db.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async updateUserLockState(userId: string, data: { failedLoginCount: number; lockedUntil: Date | null }) {
    return this.db.user.update({
      where: { id: userId },
      data,
    });
  }

  appendLoginAudit(input: {
    restaurantId: string;
    userId?: string | null;
    usernameAttempted: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    success: boolean;
    failureReason?: string | null;
    event?: string;
  }) {
    return this.db.loginAuditLog.create({
      data: {
        restaurantId: input.restaurantId,
        userId: input.userId ?? null,
        usernameAttempted: input.usernameAttempted,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        success: input.success,
        failureReason: input.failureReason ?? null,
        event: input.event ?? "login",
      },
    });
  }

  getUserPublic(userId: string): Promise<Pick<User, "id" | "username" | "fullName" | "status" | "restaurantId"> | null> {
    return this.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, username: true, fullName: true, status: true, restaurantId: true },
    });
  }

  listSessionsForUser(userId: string) {
    return this.db.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }
}

export function collectRoleCodes(user: UserWithAuthRelations): RoleCode[] {
  const set = new Set<RoleCode>();
  for (const ur of user.roles) {
    set.add(ur.role.code);
  }
  return [...set];
}

export function collectPermissionCodes(user: UserWithAuthRelations): string[] {
  const set = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) {
      set.add(rp.permission.code);
    }
  }
  return [...set].sort();
}

export function isLoginAllowedStatus(status: UserStatus): boolean {
  return status === "ACTIVE";
}
