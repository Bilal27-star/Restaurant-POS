import * as React from "react";

import { ensureDesktopBackendReady } from "@/lib/app-api";
import { isTauriDesktop } from "@/lib/desktop/tauri-host";

type ExitPayload = {
  stderrTail?: string;
  lastSpawnError?: string;
  logPath?: string;
  spawnFailed?: boolean;
  exitCode?: number | null;
};

/**
 * Production Tauri: blocks the React tree until the embedded API is reachable (TCP + /health),
 * then keeps a listener for unexpected backend exit so the UI does not fail silently.
 */
export function DesktopAppShell({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = React.useState<"native" | "boot" | "ready" | "error">(() =>
    isTauriDesktop() ? "boot" : "native",
  );
  const [errorText, setErrorText] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isTauriDesktop()) {
      setPhase("native");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await ensureDesktopBackendReady({ timeoutMs: 120_000 });
        if (!cancelled) setPhase("ready");
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErrorText(msg);
        setPhase("error");
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const st = await invoke<{
            stderrTail: string;
            logTail: string;
            logPath: string;
            running: boolean;
            ready: boolean;
          }>("pos_backend_status");
          const tail = [st.stderrTail?.trim(), st.logTail?.trim()?.slice(-6000)]
            .filter(Boolean)
            .join("\n---\n");
          setErrorText(
            `${msg}\n\nprocess running=${String(st.running)} tcpReady=${String(st.ready)}\n\n${tail || "(no log excerpt)"}\n\nLog file: ${st.logPath ?? ""}`,
          );
        } catch {
          /* keep shorter message */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!isTauriDesktop() || phase !== "ready") return;

    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<ExitPayload>("pos-backend-exit", (ev) => {
          const p = ev.payload;
          const lines = [
            p.spawnFailed
              ? "The local POS server failed to start or could not be packaged correctly."
              : "The local POS server stopped unexpectedly.",
            p.lastSpawnError,
            p.stderrTail,
            p.logPath ? `Log file: ${p.logPath}` : undefined,
          ].filter((x): x is string => Boolean(x?.trim()));
          setErrorText(lines.join("\n\n"));
          setPhase("error");
        });
      } catch {
        /* ignore */
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [phase]);

  if (phase === "native") {
    return <>{children}</>;
  }

  if (phase === "boot") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0b0616] px-6 text-center text-zinc-100">
        <div className="text-lg font-semibold">Starting local POS server…</div>
        <p className="max-w-md text-sm text-zinc-400">
          Embedded database and API are starting. This can take up to a minute on first launch after install.
        </p>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" aria-hidden />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#0b0616] px-6 text-zinc-100">
        <div className="text-lg font-semibold text-red-400">Local server problem</div>
        <pre className="max-h-[60vh] max-w-3xl overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-4 text-left text-xs text-zinc-300">
          {errorText ?? "Unknown error."}
        </pre>
        <p className="max-w-lg text-center text-sm text-zinc-500">
          If this persists after reinstall, send this screen and the log file path to support.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
