import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { RouteErrorBoundary } from "@/components/error-boundary/route-error-boundary";
import { TablesLayoutSync } from "@/components/tables/tables-layout-sync";
import { usePosRealtime } from "@/hooks/use-pos-realtime";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fr } from "@/lib/locale/fr";
import { AppContent } from "./app-content";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { ShellBackground } from "./shell-background";
import { SidebarNav } from "./sidebar-nav";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { pathname } = useLocation();
  usePosRealtime();

  return (
    <div
      className="relative isolate flex h-dvh min-h-0 w-full flex-col bg-background text-foreground lg:flex-row"
    >
      <ShellBackground />

      <AppSidebar collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} />

      <TablesLayoutSync />

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          hideClose
          className="relative w-[15.5rem] max-w-[min(100vw,15.5rem)] overflow-hidden border-r border-slate-800/90 bg-[#0b1220] p-0 text-slate-200 shadow-app-soft"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{fr.appShell.sheetMenuTitle}</SheetTitle>
          </SheetHeader>
          <div className="relative z-10 flex h-full min-h-0 flex-col">
            <SidebarNav collapsed={false} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <AppTopbar onMenuClick={() => setMobileNavOpen(true)} />
        <AppContent>
          <RouteErrorBoundary resetKey={pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </AppContent>
      </div>
    </div>
  );
}
