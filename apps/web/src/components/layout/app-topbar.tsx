import { Bell, Clock3, LogOut, Menu, UserRound, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { gradientClassForSeed, initialsFromDisplayName } from "@/lib/user-initials";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { fr, frPageTitle } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { useConnectivityStore } from "@/state/stores/connectivity-store";

export interface AppTopbarProps {
  onMenuClick: () => void;
}

/** Opaque dark chrome — must stay readable on any page background (no blend with canvas). */
const TOPBAR_BG = "#0f172a";

/** Ghost on dark: override default `hover:bg-muted` / `hover:text-foreground` from `button`. */
const topbarIconBtn =
  "bg-transparent text-slate-100 hover:!bg-white/12 hover:!text-white active:!bg-white/10 [&_svg]:text-current";

const topbarGhostSm =
  "bg-transparent text-slate-100 hover:!bg-white/12 hover:!text-white active:!bg-white/10 [&_svg]:text-current";

export function AppTopbar({ onMenuClick }: AppTopbarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const title = frPageTitle(pathname);
  const connectivity = useConnectivityStore(
    useShallow((s) => ({
      mode: s.mode,
      pending: s.pendingOutboxCount,
    })),
  );

  const connectivityLabel =
    connectivity.mode === "ONLINE"
      ? fr.topbar.connectivityOnline
      : connectivity.mode === "OFFLINE"
        ? fr.topbar.connectivityOffline
        : fr.topbar.connectivitySyncing;
  const ConnectivityIcon =
    connectivity.mode === "OFFLINE" ? WifiOff : connectivity.mode === "SYNCING" ? RefreshCw : Wifi;

  return (
    <header
      data-app-topbar
      style={{ backgroundColor: TOPBAR_BG }}
      className={cn(
        "sticky top-0 z-50 flex h-14 shrink-0 items-center gap-3 border-b border-slate-600/90 px-4 text-slate-100",
        "shadow-[0_4px_12px_rgba(0,0,0,0.12),inset_0_-1px_0_rgba(255,255,255,0.06)]",
        "md:h-[3.5rem] md:gap-4 md:px-5",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className={cn("relative lg:hidden", topbarIconBtn)}
        onClick={onMenuClick}
        aria-label={fr.aria.openMenu}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </Button>

      <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-white md:text-lg">{title}</h1>

      <div className="mx-auto hidden min-w-0 flex-1 justify-center gap-2 xl:flex">
        {[
          { label: fr.topbar.chipOrders, value: "8" },
          { label: fr.topbar.chipTables, value: "12" },
          { label: fr.topbar.chipTakeaway, value: "3" },
        ].map((chip) => (
          <div
            key={chip.label}
            className="flex h-10 min-w-[6.25rem] items-center gap-2 rounded-lg border border-slate-600/60 bg-slate-800/60 px-2.5 shadow-app-soft"
          >
            <Clock3 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            <div className="flex min-w-0 flex-col leading-none">
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{chip.label}</span>
              <span className="text-sm font-semibold tabular-nums text-white">{chip.value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium tabular-nums shadow-app-soft sm:gap-2 sm:px-2.5 sm:py-1.5 sm:text-sm",
            connectivity.mode === "ONLINE" && "border-emerald-700/60 bg-emerald-950/50 text-emerald-100",
            connectivity.mode === "OFFLINE" && "border-amber-700/70 bg-amber-950/55 text-amber-100",
            connectivity.mode === "SYNCING" && "border-sky-700/60 bg-sky-950/50 text-sky-100",
          )}
          title={fr.aria.connectivityStatus}
          aria-live="polite"
        >
          <ConnectivityIcon
            className={cn("h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4", connectivity.mode === "SYNCING" && "animate-spin")}
            aria-hidden
          />
          <span className="max-w-[5.5rem] truncate sm:max-w-none">{connectivityLabel}</span>
          {connectivity.pending > 0 ? (
            <span className="hidden text-[10px] uppercase tracking-wide text-slate-300 sm:inline">
              {fr.topbar.connectivityPending(connectivity.pending)}
            </span>
          ) : null}
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-slate-600/60 bg-slate-800/60 px-3 py-1.5 shadow-app-soft sm:flex">
          <Clock3 className="h-4 w-4 text-slate-400" aria-hidden />
          <span className="text-sm font-medium tabular-nums text-white">21:21</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("relative", topbarIconBtn)}
          aria-label={fr.aria.notifications}
        >
          <Bell className="h-[18px] w-[18px]" aria-hidden />
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-semibold text-white shadow-app-soft">
            16
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-9 w-9 shrink-0 overflow-hidden rounded-full p-0 ring-1 ring-white/15 hover:ring-white/25",
            topbarIconBtn,
          )}
          aria-label={fr.aria.account}
          title={user?.fullName ?? user?.username ?? undefined}
        >
          {user ? (
            <span
              className={cn(
                "flex h-full w-full items-center justify-center bg-gradient-to-br text-[11px] font-bold uppercase leading-none tracking-tight text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
                gradientClassForSeed(user.id),
              )}
              aria-hidden
            >
              {initialsFromDisplayName(user.fullName?.trim() || user.username)}
            </span>
          ) : (
            <UserRound className="h-5 w-5" aria-hidden />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("hidden gap-2 sm:inline-flex", topbarGhostSm)}
          onClick={async () => {
            await logout();
            navigate("/login", { replace: true });
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {fr.topbar.logout}
        </Button>
      </div>
    </header>
  );
}
