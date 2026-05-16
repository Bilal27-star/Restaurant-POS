import * as React from "react";
import { UtensilsCrossed } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiClientError } from "@pos/api-client";

export function LoginPage() {
  const { login, accessToken } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const [restaurantSlug, setRestaurantSlug] = React.useState("default");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (accessToken) {
      navigate(from, { replace: true });
    }
  }, [accessToken, from, navigate]);

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
          <Button type="submit" disabled={busy || !password} className="h-11 w-full">
            {busy ? "Connexion…" : "Se connecter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
