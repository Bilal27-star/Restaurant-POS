import * as React from "react";
import { UtensilsCrossed } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@pos/api-client";
import { resolvedApiOrigin, waitForBackendHealth } from "@/lib/app-api";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";

type BackendExitPayload = {
  stderrTail?: string;
  lastSpawnError?: string;
  logPath?: string;
  spawnFailed?: boolean;
  exitCode?: number | null;
};

export function LoginPage() {
  const { login, accessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [restaurantSlug, setRestaurantSlug] = React.useState("demo");
  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("admin");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [backendReady, setBackendReady] = React.useState(!isTauriDesktop());

  React.useEffect(() => {
    if (!isTauriDesktop()) {
      setBackendReady(true);
      return;
    }

    let mounted = true;
    let unlisten: (() => void) | undefined;
    const backendStopped = { current: false };
    const TIMEOUT_MS = 30_000;

    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<BackendExitPayload>("pos-backend-exit", (ev) => {
          if (!mounted) return;
          backendStopped.current = true;
          const p = ev.payload;
          const lines = [
            p.spawnFailed
              ? "Impossible de démarrer le serveur local intégré."
              : "Le serveur local s'est arrêté de façon inattendue.",
            p.lastSpawnError,
            p.stderrTail,
            p.logPath ? `Journal : ${p.logPath}` : undefined,
          ].filter((x): x is string => Boolean(x?.trim()));
          setError(lines.join("\n\n"));
          setBackendReady(true);
        });
      } catch {
        /* older / broken Tauri bridge — fall back to health polling only */
      }

      const origin = resolvedApiOrigin();
      if (!origin) {
        if (mounted) setBackendReady(true);
        return;
      }

      const health = await waitForBackendHealth({ timeoutMs: TIMEOUT_MS, pollMs: 400 });
      if (!mounted || backendStopped.current) return;

      if (health.ok) {
        setBackendReady(true);
        return;
      }

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const st = await invoke<{
          stderrTail: string;
          logTail: string;
          logPath: string;
          running: boolean;
        }>("pos_backend_status");
        const tail = [st.stderrTail?.trim(), st.logTail?.trim()?.slice(-4000)]
          .filter(Boolean)
          .join("\n---\n");
        setError(
          `Le serveur local ne répond pas après ${TIMEOUT_MS / 1000}s (processus actif : ${String(st.running)}).\n\n${tail || "(aucun extrait de journal)"}\n\nFichier : ${st.logPath ?? ""}`,
        );
      } catch {
        setError(
          `Le serveur local ne répond pas après ${TIMEOUT_MS / 1000}s. Consultez ${origin.replace(/\/$/, "")} et le fichier backend.log sous le dossier données de l'application.`,
        );
      }
      setBackendReady(true);
    })();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  React.useEffect(() => {
    if (accessToken && backendReady) {
      navigate(from, { replace: true });
    }
  }, [accessToken, backendReady, from, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login({ restaurantSlug: restaurantSlug.trim(), username: username.trim(), password });
      navigate(from, { replace: true });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Connexion impossible";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0b0616] px-4 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-zinc-900/80 p-8 shadow-xl backdrop-blur-md">
        <div className="flex flex-col items-center gap-3">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-[0_12px_36px_rgba(234,88,12,0.32)] ring-1 ring-white/20"
            aria-hidden
          >
            <UtensilsCrossed className="size-8" strokeWidth={2.25} />
          </div>
          <h1 className="text-center text-2xl font-bold tracking-tight">Restaurant POS</h1>
        </div>
        <p className="mt-2 text-center text-sm text-muted-foreground">Connectez-vous pour continuer</p>

        <form className="mt-8 flex flex-col gap-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="slug">
              Restaurant (slug)
            </label>
            <Input
              id="slug"
              name="slug"
              autoComplete="organization"
              value={restaurantSlug}
              onChange={(e) => setRestaurantSlug(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="user">
              Utilisateur
            </label>
            <Input
              id="user"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="pass">
              Mot de passe
            </label>
            <Input
              id="pass"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <Button type="submit" disabled={busy || !password || !backendReady} className="h-11 w-full">
            {!backendReady ? "Démarrage du serveur local..." : busy ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
