import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full min-h-11 rounded-lg border border-input bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-surface-xs transition-[box-shadow,border-color,colors] duration-200",
        "placeholder:text-[color:var(--placeholder-foreground)]",
        "hover:border-slate-400/90 hover:shadow-surface-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:shadow-surface-sm",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
