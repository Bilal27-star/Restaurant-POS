import { AlertTriangle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { logPageRoute } from "@/lib/desktop/page-route-log";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

export type PageQueryStateProps = {
  label: string;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children: ReactNode;
  className?: string;
  showLoadingOverlay?: boolean;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "Unknown error");
}

/** Standard loading / error / empty shell so feature pages never render as blank voids. */
export function PageQueryState({
  label,
  isLoading,
  isError,
  error,
  isEmpty = false,
  emptyTitle,
  emptyDescription,
  onRetry,
  children,
  className,
  showLoadingOverlay = true,
}: PageQueryStateProps) {
  useEffect(() => {
    if (isError) {
      logPageRoute("query_error", { label, message: errorMessage(error) });
    }
  }, [isError, label, error]);

  if (isError) {
    return (
      <div
        className={cn(
          "flex min-h-[min(50vh,28rem)] flex-col items-center justify-center gap-4 rounded-2xl border border-red-500/35 bg-red-950/25 px-6 py-10 text-center",
          className,
        )}
        role="alert"
      >
        <AlertTriangle className="size-10 text-red-300" aria-hidden />
        <div className="max-w-lg space-y-2">
          <h2 className="text-lg font-semibold text-red-100">{emptyTitle ?? `Impossible de charger ${label}`}</h2>
          <p className="text-sm text-red-200/90">{errorMessage(error)}</p>
          {emptyDescription ? <p className="text-xs text-red-200/70">{emptyDescription}</p> : null}
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
            Réessayer
          </Button>
        ) : null}
      </div>
    );
  }

  if (isLoading && isEmpty) {
    return (
      <div
        className={cn(
          "flex min-h-[min(50vh,28rem)] flex-col items-center justify-center gap-3 text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="size-9 animate-spin text-violet-400" aria-hidden />
        <p className="text-sm font-medium">Chargement de {label}…</p>
      </div>
    );
  }

  return (
    <div className={cn("relative min-h-0", className)}>
      {showLoadingOverlay && isLoading ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center bg-background/40 pt-16 backdrop-blur-[1px]">
          <Loader2 className="size-8 animate-spin text-violet-400" aria-hidden />
        </div>
      ) : null}
      {isEmpty ? (
        <div className="flex min-h-[min(40vh,24rem)] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/[0.12] bg-purple-950/10 px-6 py-12 text-center">
          <p className="text-base font-semibold text-foreground">{emptyTitle ?? `Aucune donnée pour ${label}`}</p>
          {emptyDescription ? (
            <p className="max-w-md text-sm text-muted-foreground">{emptyDescription}</p>
          ) : null}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
