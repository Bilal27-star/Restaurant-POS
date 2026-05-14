import { cn } from "@/lib/utils";
import { SidebarNav } from "./sidebar-nav";

export interface AppSidebarProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function AppSidebar({ collapsed, onCollapsedChange }: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "relative z-10 hidden min-h-0 shrink-0 overflow-hidden lg:flex",
        "border-r border-slate-800/90 bg-[#0b1220] text-slate-200 shadow-app-soft",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width]",
        collapsed ? "w-20 min-w-20 max-w-20" : "w-[15.5rem] min-w-[15.5rem]",
      )}
      aria-label="Application sidebar"
      data-collapsed={collapsed ? "" : undefined}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <SidebarNav
          collapsed={collapsed}
          onToggleCollapsed={() => onCollapsedChange(!collapsed)}
        />
      </div>
    </aside>
  );
}
