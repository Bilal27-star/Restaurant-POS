import { NavLink } from "react-router-dom";
import { memo, useMemo } from "react";
import { ChevronLeft, ChevronRight, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { formatNavBadgeValue, useNavCountsQuery } from "@/hooks/use-nav-counts";
import { navSections, type NavBadgeSource, type NavItemConfig } from "./nav-config";

function badgeForRoute(
  source: NavBadgeSource | undefined,
  raw: { occupiedTables: number; dineInOpenOrders: number; takeawayOpen: number } | undefined,
): string | undefined {
  if (!source || !raw) return undefined;
  const n =
    source === "occupiedTables"
      ? raw.occupiedTables
      : source === "dineInOpenOrders"
        ? raw.dineInOpenOrders
        : raw.takeawayOpen;
  return formatNavBadgeValue(n);
}

const RAIL_ICON_BOX = "flex size-10 shrink-0 items-center justify-center rounded-xl p-0";

const activeRail = cn(
  "bg-gradient-to-br from-violet-600 to-pink-600 text-white shadow-[0_0_26px_-10px_rgba(167,139,250,0.5)] ring-1 ring-white/20",
);

const activeExpanded = cn(
  "bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-app-soft ring-1 ring-white/15",
);

export interface SidebarNavProps {
  /** Desktop rail mode — hides labels, section titles, shortcuts. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Close mobile drawer after navigation */
  onNavigate?: () => void;
}

function itemAllowed(item: NavItemConfig, permSet: Set<string>): boolean {
  if (!item.anyOfPermissions?.length) return true;
  return item.anyOfPermissions.some((p) => permSet.has(p));
}

const NavItemRow = memo(function NavItemRow({
  item,
  collapsed,
  onNavigate,
  badgeText,
}: {
  item: NavItemConfig;
  collapsed: boolean;
  onNavigate?: () => void;
  badgeText?: string;
}) {
  const link = (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "outline-none transition-[background,box-shadow,color,border-color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-0",
          collapsed
            ? cn(
                RAIL_ICON_BOX,
                "mx-auto text-slate-400 hover:bg-white/[0.08] hover:text-slate-100 hover:shadow-[0_0_22px_-10px_rgba(139,92,246,0.22)]",
                isActive ? activeRail : "border border-transparent",
              )
            : cn(
                "flex h-11 w-full min-w-0 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium",
                isActive
                  ? activeExpanded
                  : "border border-transparent text-slate-400 hover:bg-white/[0.07] hover:text-slate-100 hover:shadow-[0_0_20px_-8px_rgba(139,92,246,0.18)]",
              ),
        )
      }
    >
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <item.icon className="size-5 shrink-0" aria-hidden />
        {badgeText && collapsed ? (
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-pink-500 px-1 text-[10px] font-semibold leading-none text-white shadow-app-soft">
            {badgeText}
          </span>
        ) : null}
      </span>
      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.kbd ? (
            <span className="shrink-0 text-[11px] text-[#6b7280] tabular-nums">{item.kbd}</span>
          ) : badgeText ? (
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-[#6b7280]">{badgeText}</span>
          ) : null}
        </>
      ) : null}
    </NavLink>
  );

  if (collapsed) {
    return (
      <li className="flex w-full list-none justify-center">
        <Tooltip delayDuration={180}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" align="center">
            {item.label}
          </TooltipContent>
        </Tooltip>
      </li>
    );
  }

  return <div className="min-w-0">{link}</div>;
});

export function SidebarNav({ collapsed = false, onToggleCollapsed, onNavigate }: SidebarNavProps) {
  const { user } = useAuth();
  const { data: navCounts } = useNavCountsQuery();
  const visibleSections = useMemo(() => {
    const permSet = new Set(user?.permissions ?? []);
    return navSections
      .map((s) => ({ ...s, items: s.items.filter((it) => itemAllowed(it, permSet)) }))
      .filter((s) => s.items.length > 0);
  }, [user?.permissions]);

  const inner = (
    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col">
      <div
        className={cn(
          "flex shrink-0 items-center border-b border-slate-800/90 transition-[height,padding] duration-300 ease-out",
          "h-14 md:h-16",
          collapsed ? "justify-center px-0 py-0" : "gap-2.5 px-4",
        )}
      >
        {collapsed ? (
          onToggleCollapsed ? (
            <Tooltip delayDuration={220}>
              <TooltipTrigger asChild>
                <div
                  className="flex size-10 shrink-0 cursor-default items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-app-soft ring-1 ring-white/15 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45 focus-visible:ring-offset-0 focus-visible:ring-offset-[#0b1220]"
                  tabIndex={0}
                  aria-label={fr.brand.appName}
                >
                  <UtensilsCrossed className="size-[18px]" strokeWidth={2.25} aria-hidden />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                {fr.brand.appName}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-app-soft ring-1 ring-white/15"
              aria-hidden
            >
              <UtensilsCrossed className="size-[18px]" strokeWidth={2.25} />
            </div>
          )
        ) : (
          <>
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 text-white shadow-app-soft ring-1 ring-white/15"
              aria-hidden
            >
              <UtensilsCrossed className="size-[18px]" strokeWidth={2.25} />
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-slate-100">
              {fr.brand.appName}
            </span>
          </>
        )}
      </div>

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {collapsed ? (
          <nav className="flex w-full min-w-0 flex-col items-center gap-2 px-0 py-3" aria-label={fr.aria.mainNav}>
            <ul className="flex w-full min-w-0 flex-col items-center gap-2 p-0">
              {visibleSections.flatMap((s) => s.items).map((item) => (
                <NavItemRow
                  key={item.to}
                  item={item}
                  collapsed
                  onNavigate={onNavigate}
                  badgeText={badgeForRoute(item.badgeSource, navCounts)}
                />
              ))}
            </ul>
          </nav>
        ) : (
          <nav className="flex min-w-0 flex-col gap-5 px-3 py-4" aria-label={fr.aria.mainNav}>
            {visibleSections.map((section) => (
              <div key={section.label} className="flex min-w-0 flex-col gap-0.5">
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">{section.label}</p>
                <div className="flex flex-col gap-0.5" aria-label={section.label}>
                  {section.items.map((item) => (
                    <NavItemRow
                      key={item.to}
                      item={item}
                      collapsed={false}
                      onNavigate={onNavigate}
                      badgeText={badgeForRoute(item.badgeSource, navCounts)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        )}
      </ScrollArea>

      {onToggleCollapsed ? (
        <>
          <Separator className="shrink-0 bg-slate-800/90" />
          <div className="flex shrink-0 justify-center py-2.5">
            <Tooltip delayDuration={400}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-10 shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.04] text-slate-300 shadow-none transition-[background,box-shadow,border-color,color,transform] duration-200 ease-out",
                    "hover:border-violet-500/30 hover:bg-white/[0.09] hover:text-white hover:shadow-[0_0_24px_-8px_rgba(139,92,246,0.35)]",
                    "focus-visible:ring-2 focus-visible:ring-violet-500/40 focus-visible:ring-offset-0",
                  )}
                  aria-label={collapsed ? fr.aria.expandSidebar : fr.aria.collapseSidebar}
                  aria-expanded={!collapsed}
                  onClick={onToggleCollapsed}
                >
                  <span className="relative flex size-5 items-center justify-center">
                    <ChevronLeft
                      className={cn(
                        "absolute size-5 transition-all duration-200 ease-out",
                        collapsed ? "translate-x-0.5 opacity-0 scale-90" : "translate-x-0 opacity-100 scale-100",
                      )}
                      aria-hidden
                      strokeWidth={2.25}
                    />
                    <ChevronRight
                      className={cn(
                        "absolute size-5 transition-all duration-200 ease-out",
                        collapsed ? "translate-x-0 opacity-100 scale-100" : "-translate-x-0.5 opacity-0 scale-90",
                      )}
                      aria-hidden
                      strokeWidth={2.25}
                    />
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                {collapsed ? fr.aria.expandSidebar : fr.aria.collapseSidebar}
              </TooltipContent>
            </Tooltip>
          </div>
        </>
      ) : null}
    </div>
  );

  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={0}>
      {inner}
    </TooltipProvider>
  );
}
