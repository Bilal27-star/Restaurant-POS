import { AlertTriangle } from "lucide-react";
import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { Button } from "@/components/ui/button";
import { logDataFlow } from "@/lib/desktop/data-flow-log";
import { fr } from "@/lib/locale/fr";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Root shell: catches render errors so a single bad screen does not white-screen the kiosk.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logDataFlow("app_render_error", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    console.error("[AppErrorBoundary]", error, errorInfo.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-6 py-16 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-200">
            <AlertTriangle className="size-8" aria-hidden />
          </div>
          <div className="max-w-md space-y-2">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{fr.errorBoundary.title}</h1>
            <p className="text-sm text-muted-foreground">{fr.errorBoundary.description}</p>
            {import.meta.env.DEV ? (
              <pre className="mt-4 max-h-40 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
                {this.state.error.message}
              </pre>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" variant="default" className="rounded-xl" onClick={this.handleRetry}>
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
