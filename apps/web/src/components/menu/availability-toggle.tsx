import { cn } from "@/lib/utils";
import { fr } from "@/lib/locale/fr";

export interface AvailabilityToggleProps {
  available: boolean;
  onChange: (available: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function AvailabilityToggle({ available, onChange, disabled, className }: AvailabilityToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={available}
      disabled={disabled}
      onClick={() => onChange(!available)}
      className={cn(
        "relative inline-flex h-[1.875rem] w-[3.125rem] shrink-0 items-center rounded-full border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        available
          ? "border-emerald-400/35 bg-emerald-500/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_12px_-4px_rgba(16,185,129,0.35)]"
          : "border-pos-border-subtle bg-zinc-800/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute left-[3px] top-1/2 flex h-[1.375rem] w-[1.375rem] -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-out",
          available ? "translate-x-[1.25rem]" : "translate-x-0",
        )}
      />
      <span className="sr-only">{available ? fr.availabilityToggle.on : fr.availabilityToggle.off}</span>
    </button>
  );
}
