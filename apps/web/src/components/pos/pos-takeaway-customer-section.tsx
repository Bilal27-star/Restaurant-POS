import { MapPin, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TakeawayCustomer } from "@/components/takeaway/takeaway-customer-types";
import type { TakeawayCustomerDraft, TakeawayCustomerFieldErrorKey } from "@/components/takeaway/takeaway-customer-validation";
import { formatAlgeriaPhoneDisplay } from "@/components/takeaway/takeaway-phone-utils";
import { cn } from "@/lib/utils";

export interface PosTakeawayCustomerSectionProps {
  draft: TakeawayCustomerDraft;
  onDraftChange: (patch: Partial<TakeawayCustomerDraft>) => void;
  customerSearch: string;
  onCustomerSearchChange: (q: string) => void;
  savedMatches: TakeawayCustomer[];
  onPickSavedCustomer: (c: TakeawayCustomer) => void;
  fieldErrors: Partial<Record<TakeawayCustomerFieldErrorKey, string>>;
}

const textareaClass = cn(
  "flex min-h-[4.25rem] w-full rounded-lg border border-input bg-black/25 px-3 py-2 text-sm font-medium text-on-dark-table shadow-sm transition-colors",
  "placeholder:text-on-dark-placeholder",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
  "disabled:cursor-not-allowed disabled:text-on-dark-disabled disabled:opacity-90",
);

export function PosTakeawayCustomerSection({
  draft,
  onDraftChange,
  customerSearch,
  onCustomerSearchChange,
  savedMatches,
  onPickSavedCustomer,
  fieldErrors,
}: PosTakeawayCustomerSectionProps) {
  const showList = savedMatches.length > 0 && customerSearch.trim().length >= 1;

  return (
    <div className="surface-dark-ink rounded-xl border border-violet-500/25 bg-gradient-to-b from-purple-950/45 to-zinc-950/40 p-3 shadow-[0_0_28px_rgba(139,92,246,0.12)] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200/90">Client livraison</p>
        <span className="rounded-md bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-200/95">
          Takeaway
        </span>
      </div>

      <div className="relative mt-2.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fuchsia-300/70" aria-hidden />
        <Input
          value={customerSearch}
          onChange={(e) => onCustomerSearchChange(e.target.value)}
          placeholder="Recherche nom ou téléphone…"
          className={cn(
            "h-10 min-h-10 border-white/[0.08] bg-black/25 pl-10 text-[13px] text-on-dark-table",
            "placeholder:text-on-dark-placeholder",
          )}
          aria-label="Recherche client"
          autoComplete="off"
        />
        {showList ? (
          <ul
            className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-48 overflow-y-auto rounded-lg border border-white/[0.1] bg-zinc-950/95 py-1 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            role="listbox"
          >
            {savedMatches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition hover:bg-violet-500/15"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onPickSavedCustomer(c);
                    onCustomerSearchChange("");
                  }}
                >
                  <span className="font-semibold text-on-dark-title">{c.name}</span>
                  <span className="text-xs tabular-nums text-on-dark-secondary">{formatAlgeriaPhoneDisplay(c.phone)}</span>
                  {c.address.trim() ? (
                    <span className="line-clamp-1 text-[11px] text-violet-200/80">{c.address}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-on-dark-label">
            <User className="size-3 text-violet-300/80" aria-hidden />
            Nom
          </label>
          <Input
            value={draft.name}
            onChange={(e) => onDraftChange({ name: e.target.value })}
            placeholder="Nom complet"
            className={cn("h-10 min-h-10 border-white/[0.08] bg-black/25 text-[13px] text-on-dark-table placeholder:text-on-dark-placeholder", fieldErrors.name && "border-red-400/50")}
            aria-invalid={!!fieldErrors.name}
            autoComplete="name"
          />
          {fieldErrors.name ? <p className="text-[11px] text-red-300/95">{fieldErrors.name}</p> : null}
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wide text-on-dark-label">Téléphone</label>
          <Input
            inputMode="tel"
            value={draft.phone}
            onChange={(e) => onDraftChange({ phone: formatAlgeriaPhoneDisplay(e.target.value) })}
            placeholder="+213 5XX XX XX XX"
            className={cn("h-10 min-h-10 border-white/[0.08] bg-black/25 text-[13px] tabular-nums text-on-dark-table placeholder:text-on-dark-placeholder", fieldErrors.phone && "border-red-400/50")}
            aria-invalid={!!fieldErrors.phone}
            autoComplete="tel"
          />
          {fieldErrors.phone ? <p className="text-[11px] text-red-300/95">{fieldErrors.phone}</p> : null}
        </div>
      </div>

      <div className="mt-2.5 space-y-1">
        <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-on-dark-label">
          <MapPin className="size-3 text-orange-300/85" aria-hidden />
          Adresse de livraison
        </label>
        <textarea
          value={draft.address}
          onChange={(e) => onDraftChange({ address: e.target.value })}
          placeholder="Quartier, rue, étage, code porte…"
          rows={2}
          className={cn(textareaClass, "resize-none border-white/[0.08] bg-black/25", fieldErrors.address && "border-red-400/50")}
          aria-invalid={!!fieldErrors.address}
        />
        {fieldErrors.address ? <p className="text-[11px] text-red-300/95">{fieldErrors.address}</p> : null}
      </div>

      <div className="mt-2.5 space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-wide text-on-dark-label">Notes livraison (optionnel)</label>
        <textarea
          value={draft.notes}
          onChange={(e) => onDraftChange({ notes: e.target.value })}
          placeholder="Sonnette, point de repère, horaire…"
          rows={2}
          className={cn(textareaClass, "resize-none border-white/[0.08] bg-black/25")}
        />
      </div>

      <div className="mt-2.5 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 text-[11px] font-medium text-on-dark-secondary hover:bg-white/[0.08] hover:text-on-dark-title"
          onClick={() => {
            onDraftChange({ name: "", phone: "", address: "", notes: "" });
            onCustomerSearchChange("");
          }}
        >
          Effacer le client
        </Button>
      </div>
    </div>
  );
}
