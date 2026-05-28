import type { LoginRequest } from "@pos/api-client";
import * as React from "react";

import { getConnectionMode } from "@/lib/api-connection-config";
import { ensureDesktopBackendReady, getAccessToken, getAppApi, resetAppApiClient, setAccessToken } from "@/lib/app-api";
import { clearAppQueryCache } from "@/lib/app-query-client";

export type AuthUser = {
  id: string;
  restaurantId: string;
  username: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
};

type AuthContextValue = {
  accessToken: string | null;
  user: AuthUser | null;
  ready: boolean;
  login: (body: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccess] = React.useState<string | null>(() => getAccessToken());
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    const t = getAccessToken();
    if (!t) return;
    let cancelled = false;
    void (async () => {
      try {
        if (getConnectionMode() !== "remote") {
          await ensureDesktopBackendReady();
        }
        if (cancelled) return;
        const m = await getAppApi().auth.me();
        if (!cancelled) {
          setUser(m.user as AuthUser);
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          resetAppApiClient();
          setAccess(null);
          setUser(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const login = React.useCallback(async (body: LoginRequest) => {
    clearAppQueryCache();
    const res = await getAppApi().auth.login(body);
    setAccessToken(res.accessToken);
    resetAppApiClient();
    setAccess(res.accessToken);
    setUser(res.user as AuthUser);
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await getAppApi().auth.logout({});
    } catch {
      /* ignore network errors on logout */
    }
    clearAppQueryCache();
    setAccessToken(null);
    resetAppApiClient();
    setAccess(null);
    setUser(null);
  }, []);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      accessToken,
      user,
      ready,
      login,
      logout,
    }),
    [accessToken, user, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
