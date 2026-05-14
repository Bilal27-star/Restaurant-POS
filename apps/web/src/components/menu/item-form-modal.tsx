import { ChevronDown, Loader2, X, Upload, Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
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
import type { MenuCategory, MenuItem, MenuIngredient } from "./menu-types";
import { IngredientInput } from "./ingredient-input";
import { ModifierInput } from "./modifier-input";

function newLocalId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const overlayClass = cn(
  "!bg-black/[0.58] backdrop-blur-xl",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300 ease-out",
);

const panelClass = cn(
  "flex min-h-0 max-h-[90vh] w-[min(100vw-1.25rem,36rem)] flex-col overflow-hidden rounded-[22px] border border-pos-border-subtle p-0",
  "bg-[linear-gradient(165deg,rgb(15_17_28/0.97)_0%,rgb(9_11_18/0.98)_45%,rgb(8_10_16)_100%)] text-foreground backdrop-blur-2xl",
  "shadow-[0_0_0_1px_rgb(139_92_246/0.12),0_0_100px_-28px_rgb(124_58_237/0.35),0_32px_90px_-36px_rgba(0,0,0,0.75)]",
  "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98] data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
);

const field = cn(
  "h-12 w-full rounded-xl border border-pos-border-subtle bg-pos-glass/90 text-[15px] font-medium text-foreground placeholder:text-muted-foreground",
  "shadow-[inset_0_0_0_1px_rgb(129_140_248/0.14)] transition-[border-color,box-shadow,background-color] duration-200",
  "focus-visible:border-pos-violet-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/25 focus-visible:ring-offset-0",
);

const sectionTitle = "text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground";

export interface ItemFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  categories: MenuCategory[];
  item: MenuItem | null;
  defaultCategoryId: string;
  onSave: (payload: MenuItem) => void;
}

export function ItemFormModal({ open, onOpenChange, mode, categories, item, defaultCategoryId, onSave }: ItemFormModalProps) {
  const formId = useId();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [priceRaw, setPriceRaw] = useState("");
  const [description, setDescription] = useState("");
  const [ingredients, setIngredients] = useState<MenuIngredient[]>([]);
  type ModifierRow = { id: string; name: string; priceRaw: string };
  const [modifiers, setModifiers] = useState<ModifierRow[]>([]);
  const [popular, setPopular] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const hydrate = useCallback(() => {
    if (mode === "edit" && item) {
      setName(item.name);
      setCategoryId(item.categoryId);
      setPriceRaw(String(item.priceDa));
      setDescription(item.description || "");
      setIngredients(
        item.ingredients.map((i: any) => ({
          ...i,
          removable: i.removable !== false,
        })),
      );
      setModifiers(item.modifiers.map((m: any) => ({ id: m.id, name: m.name, priceRaw: String(m.priceDa) })));
      setPopular(item.popular || false);
      setImageUrl(item.image || "");
    } else {
      setName("");
      setCategoryId(defaultCategoryId);
      setPriceRaw("");
      setDescription("");
      setIngredients([]);
      setModifiers([]);
      setPopular(false);
    }
    setErrors({});
    setSaving(false);
  }, [mode, item, defaultCategoryId]);

  useEffect(() => {
    if (open) hydrate();
  }, [open, hydrate]);

  const addIngredient = () => {
    setIngredients((prev) => [...prev, { id: newLocalId(), name: "", removable: true }]);
  };

  const addModifier = () => {
    setModifiers((prev) => [...prev, { id: newLocalId(), name: "", priceRaw: "" }]);
  };

  const validate = (): boolean => {
    const e: Record<string, boolean> = {};
    if (!name.trim()) e.name = true;
    if (!categoryId) e.category = true;
    const price = Number.parseInt(priceRaw.replace(/\D/g, ""), 10) || 0;
    if (!priceRaw.trim() || price <= 0) e.price = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 380));
    const priceDa = Number.parseInt(priceRaw.replace(/\D/g, ""), 10) || 0;
    const ingClean = ingredients
      .map((i) => ({
        id: i.id,
        name: i.name.trim(),
        removable: i.removable !== false,
      }))
      .filter((i) => i.name);
    const modClean = modifiers
      .map((m) => ({
        id: m.id,
        name: m.name.trim(),
        priceDa: Math.max(0, Number.parseInt(m.priceRaw.replace(/\D/g, ""), 10) || 0),
      }))
      .filter((m) => m.name);
    const payload: MenuItem = {
      id: mode === "edit" && item ? item.id : newLocalId(),
      categoryId,
      name: name.trim(),
      priceDa,
      description: description.trim(),
      ingredients: ingClean,
      modifiers: modClean,
      popular,
      image: imageUrl.trim() || undefined,
      available: mode === "edit" && item ? item.available : true,
    };
    onSave(payload);
    setSaving(false);
    onOpenChange(false);
  };

  const title = mode === "edit" ? fr.menuItemForm.editTitle : fr.menuItemForm.addTitle;
  const submitLabel = mode === "edit" ? fr.menuItemForm.submitUpdate : fr.menuItemForm.submitAdd;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose overlayClassName={overlayClass} className={panelClass}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{fr.menuItemForm.srDesc}</DialogDescription>

        <header className="relative shrink-0 border-b border-pos-border-subtle/90 px-6 pb-6 pt-7">
          <h2 className="pr-14 text-2xl font-bold tracking-tight text-foreground md:text-[1.7rem] md:leading-snug">{title}</h2>
          <p className="mt-2 max-w-[32ch] text-sm font-medium leading-relaxed text-muted-foreground">
            {fr.menuItemForm.headerHint}
          </p>
          <button
            type="button"
            className={cn(
              "absolute right-5 top-5 flex size-11 items-center justify-center rounded-[14px] border border-pos-border-subtle bg-pos-glass/90 text-muted-foreground",
              "shadow-surface-xs transition-[color,background-color,border-color,transform,box-shadow] duration-200 hover:border-zinc-500/40 hover:bg-secondary hover:text-foreground active:scale-[0.97]",
            )}
            onClick={() => onOpenChange(false)}
            aria-label={fr.common.close}
          >
            <X className="size-5" />
          </button>
        </header>

        <form id={formId} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className={cn(
              "scrollbar-pos-modal min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-10 pt-8",
              "space-y-10 [scrollbar-gutter:stable]",
            )}
          >
            <section className="space-y-5">
              <h3 className={sectionTitle}>Item details</h3>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2.5 md:col-span-1">
                  <label className="text-xs font-semibold text-foreground/90" htmlFor={`${formId}-name`}>
                    {fr.menuItemForm.itemName} <span className="text-rose-400">*</span>
                  </label>
                  <Input
                    id={`${formId}-name`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={cn(field, errors.name && "border-rose-500/45 ring-2 ring-rose-500/20")}
                    placeholder={fr.menuItemForm.placeholderName}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2.5 md:col-span-1">
                  <label className="text-xs font-semibold text-foreground/90" htmlFor={`${formId}-cat`}>
                    {fr.menuItemForm.category} <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <select
                      id={`${formId}-cat`}
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className={cn(
                        field,
                        "cursor-pointer appearance-none pr-11",
                        errors.category && "border-rose-500/45 ring-2 ring-rose-500/20",
                      )}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} className="bg-zinc-950">
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground opacity-80"
                      aria-hidden
                    />
                  </div>
                </div>
              </div>

              <div className="max-w-full space-y-2.5 md:max-w-[15rem]">
                <label className="text-xs font-semibold text-foreground/90" htmlFor={`${formId}-price`}>
                  {fr.menuItemForm.priceDa} <span className="text-rose-400">*</span>
                </label>
                <Input
                  id={`${formId}-price`}
                  value={priceRaw}
                  onChange={(e) => setPriceRaw(e.target.value.replace(/\D/g, ""))}
                  className={cn(field, "font-mono tabular-nums tracking-tight", errors.price && "border-rose-500/45 ring-2 ring-rose-500/20")}
                  placeholder="850"
                  inputMode="numeric"
                />
              </div>

              <div className="space-y-2.5">
                <label className="text-xs font-semibold text-foreground/90" htmlFor={`${formId}-desc`}>
                  {fr.menuItemForm.description}
                </label>
                <textarea
                  id={`${formId}-desc`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={cn(field, "min-h-[6.25rem] resize-none py-3.5 leading-relaxed")}
                  placeholder={fr.menuItemForm.placeholderDesc}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-foreground/90">
                    Photo du produit
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-pos-border-subtle bg-pos-depth/50 shadow-inner">
                      {imageUrl ? (
                        <>
                          <img src={imageUrl} alt="Preview" className="size-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setImageUrl("")}
                            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                          >
                            <X className="size-3" />
                          </button>
                        </>
                      ) : (
                        <ImageIcon className="size-8 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1">
                      <label
                        className={cn(
                          field,
                          "flex cursor-pointer items-center justify-center gap-2 px-4 text-sm hover:bg-pos-glass/100",
                        )}
                      >
                        <Upload className="size-4" />
                        <span>{imageUrl ? "Modifier" : "Télécharger"}</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                      </label>
                      <p className="mt-1.5 text-[10px] font-medium text-muted-foreground">
                        JPG, PNG ou WebP. Max 2 Mo.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-8">
                  <input
                    type="checkbox"
                    id={`${formId}-popular`}
                    checked={popular}
                    onChange={(e) => setPopular(e.target.checked)}
                    className="size-5 rounded border-pos-border-subtle bg-pos-glass text-pos-neon-magenta focus:ring-pos-neon-magenta/25"
                  />
                  <label className="text-sm font-semibold text-foreground/90" htmlFor={`${formId}-popular`}>
                    {fr.menuItemForm.popularTitle}
                  </label>
                </div>
              </div>
            </section>

            <section
              className={cn(
                "rounded-[18px] border border-pos-border-subtle/80 bg-pos-glass/[0.35] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                "ring-1 ring-violet-500/[0.06]",
              )}
            >
              <div className="mb-5 flex items-center justify-between gap-3">
                <h3 className="text-[15px] font-bold tracking-tight text-foreground">{fr.menuItemForm.ingredients}</h3>
                <Button
                  type="button"
                  onClick={addIngredient}
                  className="h-9 gap-1 rounded-[10px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] px-3.5 text-xs font-bold text-white shadow-[0_4px_20px_-6px_rgba(124,58,237,0.55)] transition hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-[0_6px_24px_-6px_rgba(219,39,119,0.35)] active:scale-[0.98]"
                >
                  <span className="text-[13px] font-extrabold leading-none">+</span>
                  {fr.menuItemForm.addIngredient}
                </Button>
              </div>
              <div className="space-y-3.5">
                {ingredients.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-pos-border-subtle/90 bg-pos-depth/40 px-4 py-10 text-center text-sm font-medium text-muted-foreground">
                    {fr.menuItemForm.ingredientsEmpty}
                  </p>
                ) : (
                  ingredients.map((ing) => (
                    <IngredientInput
                      key={ing.id}
                      value={ing.name}
                      onChange={(v) => setIngredients((prev) => prev.map((x) => (x.id === ing.id ? { ...x, name: v } : x)))}
                      removable={ing.removable !== false}
                      onRemovableChange={(next) =>
                        setIngredients((prev) => prev.map((x) => (x.id === ing.id ? { ...x, removable: next } : x)))
                      }
                      onRemove={() => setIngredients((prev) => prev.filter((x) => x.id !== ing.id))}
                    />
                  ))
                )}
              </div>
            </section>

            <section
              className={cn(
                "rounded-[18px] border border-pos-border-subtle/80 bg-pos-depth/25 p-6",
                "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ring-1 ring-black/[0.04]",
              )}
            >
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold tracking-tight text-foreground">{fr.menuItemForm.modifiersTitle}</h3>
                  <p className="mt-1.5 max-w-[40ch] text-xs font-medium leading-relaxed text-muted-foreground">
                    {fr.menuItemForm.modifiersHint}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={addModifier}
                  className="h-9 shrink-0 gap-1 rounded-[10px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] px-3.5 text-xs font-bold text-white shadow-[0_4px_20px_-6px_rgba(124,58,237,0.55)] transition hover:from-[#8b5cf6] hover:to-[#ec4899] active:scale-[0.98]"
                >
                  <span className="text-[13px] font-extrabold leading-none">+</span>
                  {fr.menuItemForm.addModifier}
                </Button>
              </div>
              <div className="space-y-3.5">
                {modifiers.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-pos-border-subtle/90 bg-pos-glass/30 px-4 py-10 text-center text-sm font-medium text-muted-foreground">
                    {fr.menuItemForm.modifiersEmpty}
                  </p>
                ) : (
                  modifiers.map((m) => (
                    <ModifierInput
                      key={m.id}
                      name={m.name}
                      priceRaw={m.priceRaw}
                      onNameChange={(v) => setModifiers((prev) => prev.map((x) => (x.id === m.id ? { ...x, name: v } : x)))}
                      onPriceChange={(raw) => setModifiers((prev) => prev.map((x) => (x.id === m.id ? { ...x, priceRaw: raw } : x)))}
                      onRemove={() => setModifiers((prev) => prev.filter((x) => x.id !== m.id))}
                    />
                  ))
                )}
              </div>
            </section>

            <div
              className={cn(
                "flex items-center justify-between gap-4 rounded-[18px] border border-pos-border-subtle/90 px-5 py-4",
                "bg-gradient-to-r from-violet-500/[0.07] via-pos-glass/40 to-fuchsia-500/[0.06] ring-1 ring-violet-500/10",
              )}
            >
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-foreground">{fr.menuItemForm.popularTitle}</p>
                <p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">
                  {fr.menuItemForm.popularHint}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={popular}
                onClick={() => setPopular(!popular)}
                className={cn(
                  "relative inline-flex h-9 w-[3.5rem] shrink-0 items-center rounded-full border transition-all duration-300 ease-out",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pos-neon-magenta/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  popular
                    ? "scale-[1.02] border-fuchsia-400/40 bg-gradient-to-r from-[#7c3aed]/85 to-[#db2777]/80 shadow-[0_0_28px_-4px_rgba(168,85,247,0.5),inset_0_1px_0_rgba(255,255,255,0.14)]"
                    : "border-pos-border-subtle bg-zinc-900/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-zinc-600/60",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none absolute left-1 top-1/2 size-7 -translate-y-1/2 rounded-full bg-white shadow-md ring-1 ring-black/5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.45,0.64,1)]",
                    popular ? "translate-x-[1.25rem]" : "translate-x-0",
                  )}
                />
                <span className="sr-only">{popular ? fr.menuItemForm.popularOnSr : fr.menuItemForm.popularOffSr}</span>
              </button>
            </div>
          </div>

          <footer
            className={cn(
              "relative z-[1] flex shrink-0 items-center justify-between gap-3 border-t border-pos-border-subtle/90 px-6 py-5",
              "bg-gradient-to-t from-[rgb(7_8_12/0.99)] via-pos-depth/98 to-pos-depth/90 backdrop-blur-md",
              "shadow-[0_-10px_40px_-12px_rgba(0,0,0,0.55)]",
            )}
          >
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-[14px] border-pos-border-subtle bg-pos-glass/80 px-5 text-sm font-semibold text-foreground shadow-sm transition hover:bg-secondary hover:shadow-surface-xs"
              onClick={() => onOpenChange(false)}
            >
              {fr.common.cancel}
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={saving}
              className="h-12 min-w-[10.5rem] rounded-[16px] border-0 bg-gradient-to-r from-[#7c3aed] to-[#db2777] px-7 text-sm font-bold text-white shadow-[0_8px_32px_-8px_rgba(124,58,237,0.5)] transition hover:from-[#8b5cf6] hover:to-[#ec4899] hover:shadow-[0_12px_36px_-10px_rgba(219,39,119,0.4)] active:scale-[0.99] disabled:opacity-55"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  {fr.menuItemForm.saving}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
