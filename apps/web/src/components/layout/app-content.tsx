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
  const isTakeaway = pathname === "/takeaway" || pathname.startsWith("/takeaway/");
  const isTables = pathname === "/tables" || pathname.startsWith("/tables/");
  const isKitchen = pathname === "/kitchen";
  /** Routes that fill the main column height (POS, takeaway board, tables, menu). */
  const isFlexFill = isPosOrders || isMenuAdmin || isTakeaway || isTables || isKitchen;
  const isAnalytics = pathname === "/analytics";
  const isSettings = pathname === "/settings";
  const isDarkShell = isAnalytics || isSettings;
  return (
    <main
      className={cn(
        "min-h-0 flex-1 overscroll-contain",
        isFlexFill
          ? "flex flex-col overflow-hidden bg-transparent p-0"
          : isDarkShell
            ? "relative z-10 overflow-y-auto bg-[#0B1120] p-4 md:p-6"
            : "relative z-10 overflow-y-auto bg-background p-4 md:p-6",
      )}
    >
      <div
        className={cn(
          "w-full",
          !isFlexFill && "mx-auto max-w-[1600px] min-h-[min(50vh,28rem)]",
          isFlexFill && "relative z-10 flex min-h-0 flex-1 flex-col",
        )}
      >
        {children}
      </div>
    </main>
  );
}
