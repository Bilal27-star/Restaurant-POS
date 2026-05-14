import type { Logger } from "pino";
import type { RoleCode } from "@prisma/client";

export type RequestAuthContext = {
  userId: string;
  restaurantId: string;
  sessionId: string;
  roles: RoleCode[];
  permissions: string[];
};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      log?: Logger;
      auth?: RequestAuthContext;
    }
  }
}

export {};
