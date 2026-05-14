import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Section-level accent for header chrome only — keeps layout identical while varying identity per panel. */
export type DashboardPanelAccent = "purple" | "pink" | "blue" | "orange" | "magenta";

export interface DashboardPanelProps {
  title: string;
  icon?: LucideIcon;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Tint for header icon — subtle differentiation without changing structure. */
  headerAccent?: DashboardPanelAccent;
}

const HEADER_ICON: Record<
  DashboardPanelAccent,
  string
> = {
  purple:
    "bg-gradient-to-br from-violet-600/40 to-indigo-600/35 text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_16px_rgba(139,92,246,0.2)] ring-white/[0.09]",
  pink:
    "bg-gradient-to-br from-pink-600/38 to-fuchsia-600/32 text-pink-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_16px_rgba(236,72,153,0.18)] ring-white/[0.09]",
  blue:
    "bg-gradient-to-br from-sky-600/40 to-blue-700/34 text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_16px_rgba(56,189,248,0.17)] ring-white/[0.09]",
  orange:
    "bg-gradient-to-br from-orange-500/38 to-amber-600/32 text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_16px_rgba(251,146,60,0.15)] ring-white/[0.09]",
  magenta:
    "bg-gradient-to-br from-fuchsia-600/38 to-rose-600/34 text-fuchsia-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_0_16px_rgba(217,70,239,0.17)] ring-white/[0.09]",
};

export function DashboardPanel({
  title,
  icon: Icon,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
  headerAccent,
}: DashboardPanelProps) {
  const iconAccent =
    headerAccent != null ? HEADER_ICON[headerAccent] : HEADER_ICON.purple;

  return (
    <section
      className={cn(
        "surface-dark-ink group/panel relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[rgba(24,24,30,0.94)] via-[rgba(14,14,20,0.94)] to-[rgba(7,7,11,0.96)] shadow-[0_28px_56px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl transition-shadow duration-300 hover:shadow-[0_32px_64px_rgba(0,0,0,0.62)]",
        className,
      )}
    >
      {/* Subtle inner depth — reduced violet fog vs. global purple overlay */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(128deg,rgba(124,58,237,0.045)_0%,transparent_42%,rgba(219,39,119,0.028)_58%,transparent_84%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_100%_0%,rgba(255,255,255,0.03),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.14] to-transparent"
        aria-hidden
      />
      <header className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-gradient-to-b from-[rgba(18,18,24,0.85)] to-[rgba(10,10,14,0.72)] px-5 py-4 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? (
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1",
                iconAccent,
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{title}</h2>
            {eyebrow ? <p className="text-xs text-muted-foreground">{eyebrow}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("relative min-h-0 flex-1", contentClassName)}>{children}</div>
    </section>
  );
}
