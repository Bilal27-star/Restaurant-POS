import { Loader2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fr } from "@/lib/locale/fr";
import type { CategoryIconId, MenuCategory } from "./menu-types";

const overlayClass = cn(
  "!bg-black/55 backdrop-blur-md",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200",
);

const panelClass = cn(
  "w-[min(100vw-1.5rem,26rem)] gap-0 overflow-hidden border-pos-border-subtle bg-pos-depth/95 p-0 text-foreground backdrop-blur-xl",
  "shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)] ring-1 ring-black/[0.08]",
  "duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
);

const field = cn(
  "h-11 rounded-xl border border-pos-border-subtle bg-pos-glass text-sm font-medium text-foreground placeholder:text-muted-foreground",
  "shadow-[inset_0_0_0_1px_rgb(129_140_248/0.15)]",
  "focus-visible:border-pos-violet-glow focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/25",
);

const ICON_OPTIONS: { id: CategoryIconId; label: string }[] = (
  [
    "pizza",
    "burger",
    "pasta",
    "meat",
    "cocktail",
    "dessert",
    "drink",
    "starter",
    "sandwich",
    "taco",
    "snack",
  ] as const satisfies readonly CategoryIconId[]
).map((id) => ({
  id,
  label: fr.menuCategoryModal.icons[id as keyof typeof fr.menuCategoryModal.icons],
}));

const COLOR_PRESETS: { id: string; label: string; tint: string }[] = [
  { id: "orange", label: fr.menuCategoryModal.colors.orange, tint: "bg-orange-500/25 text-orange-200" },
  { id: "rose", label: fr.menuCategoryModal.colors.rose, tint: "bg-rose-500/25 text-rose-200" },
  { id: "sky", label: fr.menuCategoryModal.colors.sky, tint: "bg-sky-500/25 text-sky-200" },
  { id: "emerald", label: fr.menuCategoryModal.colors.emerald, tint: "bg-emerald-500/25 text-emerald-200" },
  { id: "violet", label: fr.menuCategoryModal.colors.violet, tint: "bg-violet-500/25 text-violet-200" },
  { id: "amber", label: fr.menuCategoryModal.colors.amber, tint: "bg-amber-500/25 text-amber-200" },
];

export interface AddCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (category: MenuCategory) => void | Promise<void>;
}

export function AddCategoryModal({ open, onOpenChange, onSave }: AddCategoryModalProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [iconId, setIconId] = useState<CategoryIconId>("pizza");
  const [colorId, setColorId] = useState(COLOR_PRESETS[0]!.id);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setIconId("pizza");
      setColorId(COLOR_PRESETS[0]!.id);
      setDescription("");
      setNameError(false);
      setSaving(false);
    }
  }, [open]);

  const tint = COLOR_PRESETS.find((c) => c.id === colorId)?.tint ?? COLOR_PRESETS[0]!.tint;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      return;
    }
    setSaving(true);
    const cat: MenuCategory = {
      id: "",
      name: name.trim(),
      iconId,
      iconTint: tint,
      description: description.trim() || undefined,
    };
    try {
      await onSave(cat);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose overlayClassName={overlayClass} className={panelClass}>
        <DialogTitle className="sr-only">{fr.menuCategoryModal.srAdd}</DialogTitle>
        <DialogDescription className="sr-only">{fr.menuCategoryModal.srDesc}</DialogDescription>
        <header className="flex items-start justify-between border-b border-pos-border-subtle px-5 py-4">
          <div className="pr-10">
            <h2 className="text-lg font-semibold text-foreground">{fr.menuCategoryModal.title}</h2>
            <p className="mt-1 text-sm font-medium text-muted-foreground">{fr.menuCategoryModal.subtitle}</p>
          </div>
          <button
            type="button"
            className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-xl border border-pos-border-subtle bg-pos-glass text-muted-foreground transition hover:text-foreground"
            onClick={() => onOpenChange(false)}
            aria-label={fr.common.close}
          >
            <X className="size-5" />
          </button>
        </header>
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col">
          <div className="space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground" htmlFor={`${formId}-name`}>
              {fr.menuCategoryModal.categoryName} <span className="text-rose-400">*</span>
            </label>
            <Input
              id={`${formId}-name`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError(false);
              }}
              className={cn(field, nameError && "border-rose-500/50 ring-1 ring-rose-500/25")}
              placeholder={fr.menuCategoryModal.placeholderName}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground" htmlFor={`${formId}-icon`}>
              {fr.menuCategoryModal.icon}
            </label>
            <select
              id={`${formId}-icon`}
              value={iconId}
              onChange={(e) => setIconId(e.target.value as CategoryIconId)}
              className={cn(field, "cursor-pointer")}
            >
              {ICON_OPTIONS.map((o) => (
                <option key={o.id} value={o.id} className="bg-pos-depth">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">{fr.menuCategoryModal.color}</p>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setColorId(c.id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition-all",
                    colorId === c.id
                      ? "border-orange-400/50 bg-gradient-to-r from-[#f54900] to-[#e7000b] text-white shadow-[0_8px_20px_rgba(234,88,12,0.25)] ring-1 ring-white/10"
                      : "border-pos-border-subtle bg-pos-glass text-muted-foreground hover:border-pos-violet-glow hover:text-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground" htmlFor={`${formId}-desc`}>
              {fr.menuCategoryModal.description}{" "}
              <span className="font-normal text-muted-foreground">{fr.menuCategoryModal.optional}</span>
            </label>
            <textarea
              id={`${formId}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={cn(field, "min-h-[4.5rem] resize-none py-3")}
              placeholder={fr.menuCategoryModal.placeholderDesc}
            />
          </div>
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-pos-border-subtle bg-pos-depth/80 px-5 py-4 backdrop-blur-sm">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-pos-border-subtle bg-pos-glass text-foreground hover:bg-secondary"
              onClick={() => onOpenChange(false)}
            >
              {fr.common.cancel}
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-11 rounded-[14px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] px-6 font-semibold text-white shadow-indigo-900/15 hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-surface-md disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {fr.menuCategoryModal.saving}
                </>
              ) : (
                fr.menuCategoryModal.saveCategory
              )}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
