import type { LoginRequest } from "@pos/api-client";
import * as React from "react";

import { getLanApiConfig } from "@/lib/lan-api-config";
import {
  ensureDesktopBackendReady,
  getAccessToken,
  getAccessTokenExpiresAtMs,
  clearStoredAuthTokens,
  getAppApi,
  getRefreshToken,
  invalidateAuthSession,
  refreshSessionAccessToken,
  refreshSessionAccessTokenIfExpiring,
  registerSessionLifecycle,
  resetAppApiClient,
  setAccessToken,
  setRefreshToken,
} from "@/lib/app-api";
import { clearAppQueryCache } from "@/lib/app-query-client";

/** Poll interval for proactive refresh before JWT access expiry (default 15 min). */
const SESSION_REFRESH_CHECK_MS = 60_000;

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
    registerSessionLifecycle({
      onRefreshed: (token) => {
        setAccess(token);
      },
      onInvalidated: () => {
        setAccess(null);
        setUser(null);
        resetAppApiClient();
      },
    });
    return () => registerSessionLifecycle({});
  }, []);

  React.useEffect(() => {
    if (!accessToken) return;
    if (getAccessTokenExpiresAtMs() == null) {
      void refreshSessionAccessToken();
    }
    const tick = () => {
      void refreshSessionAccessTokenIfExpiring();
    };
    tick();
    const id = window.setInterval(tick, SESSION_REFRESH_CHECK_MS);
    return () => window.clearInterval(id);
  }, [accessToken]);

  React.useEffect(() => {
    if (!ready) return;
    const t = getAccessToken();
    if (!t) return;
    let cancelled = false;
    void (async () => {
      try {
        if (getLanApiConfig().mode !== "remote") {
          await ensureDesktopBackendReady();
        }
        if (cancelled) return;
        const m = await getAppApi().auth.me();
        if (!cancelled) {
          setUser(m.user as AuthUser);
        }
      } catch {
        if (!cancelled) {
          invalidateAuthSession("auth/me failed");
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
    setAccessToken(res.accessToken, res.expiresIn);
    if (res.refreshToken) {
      setRefreshToken(res.refreshToken);
    }
    resetAppApiClient();
    setAccess(res.accessToken);
    setUser(res.user as AuthUser);
  }, []);

  const logout = React.useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await getAppApi().auth.logout(refreshToken ? { refreshToken } : {});
    } catch {
      /* ignore network errors on logout */
    }
    clearAppQueryCache();
    clearStoredAuthTokens();
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
