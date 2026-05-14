import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface AppContentProps {
  children?: ReactNode;
}

/** Scrollable main region (Figma main column below 64px top bar). */
export function AppContent({ children }: AppContentProps) {
  const { pathname } = useLocation();
  const isPosOrders = pathname === "/orders" || pathname.startsWith("/orders/");
  const isMenuAdmin = pathname === "/menu";
  const isPosLike = isPosOrders || isMenuAdmin;
  const isAnalytics = pathname === "/analytics";
  const isSettings = pathname === "/settings";
  const isDarkShell = isAnalytics || isSettings;
  return (
    <main
      className={cn(
        "min-h-0 flex-1 overscroll-contain",
        isPosLike
          ? "flex flex-col overflow-hidden bg-transparent p-0"
          : isDarkShell
            ? "relative z-10 overflow-y-auto bg-[#0B1120] p-4 md:p-6"
            : "relative z-10 overflow-y-auto bg-background p-4 md:p-6",
      )}
    >
      <div
        className={cn(
          "w-full",
          !isPosLike && "mx-auto max-w-[1600px]",
          isPosLike && "relative z-10 flex min-h-0 flex-1 flex-col",
        )}
      >
        {children}
      </div>
    </main>
  );
}
