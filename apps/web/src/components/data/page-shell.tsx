import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageShellProps = {
  children: ReactNode;
  /** Full-height flex column (POS, menu, takeaway, tables). */
  fill?: boolean;
  className?: string;
};

/**
 * Guarantees every route paints a non-zero region so flex parents never collapse to a black void.
 */
export function PageShell({ children, fill = false, className }: PageShellProps) {
  return (
    <div
      className={cn(
        fill
          ? "relative flex min-h-0 flex-1 flex-col"
          : "relative mx-auto w-full min-h-[min(50vh,28rem)] max-w-[1600px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
