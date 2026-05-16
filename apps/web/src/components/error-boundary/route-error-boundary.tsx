import { AlertTriangle } from "lucide-react";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { Button } from "@/components/ui/button";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { fr } from "@/lib/locale/fr";

type RouteErrorBoundaryProps = {
  children: ReactNode;
  /** When this changes (e.g. route path), a previous error is cleared so the new page can render. */
  resetKey: string;
};

type RouteErrorBoundaryState = {
  error: Error | null;
};

/**
 * Per-route recovery: navigating away clears a prior crash without reloading the whole app.
 */
export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  override state: RouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logDataFlow("route_render_error", {
      route: this.props.resetKey,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    console.error("[RouteErrorBoundary]", this.props.resetKey, error, errorInfo.componentStack);
  }

  override componentDidUpdate(prevProps: RouteErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private clear = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-2xl border border-white/[0.08] bg-[rgba(12,12,18,0.75)] p-8 text-center">
          <AlertTriangle className="size-10 text-amber-400/90" aria-hidden />
          <div className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold text-foreground">{fr.errorBoundary.routeTitle}</h2>
            <p className="text-sm text-muted-foreground">{fr.errorBoundary.routeDescription}</p>
            <pre className="mt-3 max-h-32 overflow-auto rounded-lg border border-white/[0.08] bg-black/30 p-2 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="default" className="rounded-xl" onClick={this.clear}>
              {fr.errorBoundary.retryUi}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => window.location.reload()}>
              {fr.errorBoundary.reload}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
