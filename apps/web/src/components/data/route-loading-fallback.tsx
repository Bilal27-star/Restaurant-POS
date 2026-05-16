import { Loader2 } from "lucide-react";

/** Shown while React Router lazy chunks load — avoids a blank main column. */
export function RouteLoadingFallback() {
  return (
    <div
      className="flex min-h-[min(50vh,28rem)] flex-col items-center justify-center gap-3 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-9 animate-spin text-violet-400" aria-hidden />
      <p className="text-sm font-medium">Chargement de la page…</p>
    </div>
  );
}
