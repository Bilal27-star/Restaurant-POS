import { Eye, EyeOff, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { fr } from "@/lib/locale/fr";
import { cn } from "@/lib/utils";
import { parseDaInput } from "./caisse-amount-utils";
import type { CaisseEmployee } from "./caisse-financial-types";
import type { AddCaisseEmployeeInput } from "./caisse-store";

const PANEL = "bg-[#111827]";
const INPUT_BG = "bg-[#1f2937]";
const BORDER = "border-white/[0.08]";
const LABEL = "text-[#cbd5e1]";
const MUTED = "text-[#94a3b8]";

const ROLE_OPTIONS = [
  fr.caisseEmployee.roles.waiter,
  fr.caisseEmployee.roles.cashier,
  fr.caisseEmployee.roles.kitchen,
  fr.caisseEmployee.roles.delivery,
  fr.caisseEmployee.roles.manager,
  fr.caisseEmployee.roles.admin,
] as const;

const PERMISSION_IDS = ["pos", "tables", "analytics", "menu", "orders", "employees", "refunds"] as const;
const PERMISSIONS = PERMISSION_IDS.map((id) => ({
  id,
  label: fr.caisseEmployee.permissions[id],
}));

type Employment = "active" | "suspended" | "vacation";
type PermissionId = (typeof PERMISSION_IDS)[number];

function employeeStatusToEmployment(s: CaisseEmployee["status"]): Employment {
  if (s === "off") return "suspended";
  if (s === "break") return "vacation";
  return "active";
}

function normalizeRoleForSelect(role: string): string {
  const r = role.trim();
  const exact = ROLE_OPTIONS.find((opt) => opt.toLowerCase() === r.toLowerCase());
  if (exact) return exact;
  if (/caiss/i.test(r)) return fr.caisseEmployee.roles.cashier;
  if (/serveur|waiter/i.test(r)) return fr.caisseEmployee.roles.waiter;
  if (/cuisine|kitchen/i.test(r)) return fr.caisseEmployee.roles.kitchen;
  if (/livreur|delivery/i.test(r)) return fr.caisseEmployee.roles.delivery;
  if (/manager/i.test(r)) return fr.caisseEmployee.roles.manager;
  if (/admin/i.test(r)) return fr.caisseEmployee.roles.admin;
  return fr.caisseEmployee.roles.waiter;
}

const fieldClass = cn(
  "flex h-11 w-full rounded-[14px] border px-3.5 text-sm font-medium text-white shadow-sm outline-none transition-[border-color,box-shadow]",
  BORDER,
  INPUT_BG,
  "placeholder:text-[#64748b]",
  "hover:border-white/15",
  "focus-visible:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-500/25",
);

const sectionCard = cn("rounded-[18px] border p-4 sm:p-5", BORDER, "bg-[#1f2937]/25 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]");

export interface CaisseAddEmployeePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (input: AddCaisseEmployeeInput) => void;
  /** Edit mode: hydrate from this employee; submit calls `onUpdate`. */
  editingEmployee?: CaisseEmployee | null;
  onUpdate?: (id: string, input: AddCaisseEmployeeInput) => void;
}

type ShiftKind = "morning" | "evening" | "night";
type SalaryKind = "monthly" | "weekly" | "daily" | "hourly";

type FieldErrors = Partial<Record<string, string>>;

function isValidEmail(s: string) {
  if (!s.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function CaisseAddEmployeePanel({
  open,
  onOpenChange,
  onSave,
  editingEmployee = null,
  onUpdate,
}: CaisseAddEmployeePanelProps) {
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [role, setRole] = useState<string>("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [permissions, setPermissions] = useState<Record<PermissionId, boolean>>(
    () => Object.fromEntries(PERMISSION_IDS.map((id) => [id, false])) as Record<PermissionId, boolean>,
  );

  const [shiftType, setShiftType] = useState<ShiftKind>("morning");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");

  const [salaryType, setSalaryType] = useState<SalaryKind>("monthly");
  const [salaryRaw, setSalaryRaw] = useState("");

  const [employmentStatus, setEmploymentStatus] = useState<Employment>("active");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setFullName("");
    setPhone("");
    setEmail("");
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPhotoFile(null);
    setRole("");
    setUsername("");
    setPin("");
    setPassword("");
    setShowPassword(false);
    setPermissions(Object.fromEntries(PERMISSION_IDS.map((id) => [id, false])) as Record<PermissionId, boolean>);
    setShiftType("morning");
    setStartTime("09:00");
    setEndTime("17:00");
    setSalaryType("monthly");
    setSalaryRaw("");
    setEmploymentStatus("active");
    setErrors({});
    setSaving(false);
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const setPhotoFromFile = (file: File | null) => {
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      if (!file || !file.type.startsWith("image/")) {
        return null;
      }
      return URL.createObjectURL(file);
    });
    if (!file || !file.type.startsWith("image/")) {
      setPhotoFile(null);
    } else {
      setPhotoFile(file);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (editingEmployee) {
      setFullName(editingEmployee.name);
      setPhone("0550123456");
      setEmail("");
      setPhotoPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setPhotoFile(null);
      setRole(normalizeRoleForSelect(editingEmployee.role));
      setUsername(`user_${editingEmployee.id.replace(/\W/g, "").slice(0, 10)}`);
      setPin("1234");
      setPassword("password12");
      setShowPassword(false);
      setPermissions(Object.fromEntries(PERMISSION_IDS.map((id) => [id, false])) as Record<PermissionId, boolean>);
      setShiftType("morning");
      setStartTime("09:00");
      setEndTime("17:00");
      setSalaryType("monthly");
      setSalaryRaw("85000");
      setEmploymentStatus(employeeStatusToEmployment(editingEmployee.status));
      setErrors({});
      setSaving(false);
    } else {
      reset();
    }
  }, [open, editingEmployee?.id, reset]);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = fr.caisseEmployee.errRequired;
    if (!phone.trim()) next.phone = fr.caisseEmployee.errRequired;
    else if (phone.replace(/\D/g, "").length < 8) next.phone = fr.caisseEmployee.errPhone;
    if (!isValidEmail(email)) next.email = fr.caisseEmployee.errEmail;
    if (!role) next.role = fr.caisseEmployee.errRole;
    if (!username.trim()) next.username = fr.caisseEmployee.errUsername;
    else if (username.trim().length < 2) next.username = fr.caisseEmployee.errUsernameShort;
    if (!/^\d{4}$/.test(pin)) next.pin = fr.caisseEmployee.errPinFormat;
    if (!password) next.password = fr.caisseEmployee.errPassword;
    else if (password.length < 8) next.password = fr.caisseEmployee.errPasswordShort;
    if (!startTime) next.startTime = fr.caisseEmployee.errRequired;
    if (!endTime) next.endTime = fr.caisseEmployee.errRequired;
    const salaryDa = parseDaInput(salaryRaw);
    if (!salaryRaw.trim() || salaryDa <= 0) next.salary = fr.caisseEmployee.errSalary;
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 650));
    const payload: AddCaisseEmployeeInput = {
      fullName: fullName.trim(),
      role,
      employmentStatus,
    };
    if (editingEmployee && onUpdate) {
      onUpdate(editingEmployee.id, payload);
    } else {
      onSave(payload);
    }
    setSaving(false);
    handleOpenChange(false);
  };

  const togglePermission = (id: PermissionId) => {
    setPermissions((p) => ({ ...p, [id]: !p[id] }));
  };

  const overlayClass = cn(
    "!bg-black/40 backdrop-blur-[7px]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300 ease-out",
    "motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none",
  );

  const sheetMotion = cn(
    "flex h-full min-h-0 flex-col gap-0 overflow-hidden border-l p-0 shadow-[0_25px_80px_-20px_rgba(0,0,0,0.55)]",
    PANEL,
    BORDER,
    "!max-w-[min(100vw-1rem,38rem)] w-[min(100vw-1rem,38rem)] sm:!max-w-[min(100vw-1rem,38rem)]",
    "duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:slide-out-to-right-8 data-[state=open]:slide-in-from-right-8",
    "motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none",
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        hideClose
        overlayClassName={overlayClass}
        className={sheetMotion}
      >
        <header
          className={cn(
            "flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6 sm:py-5",
            BORDER,
            "bg-[#111827]/95 backdrop-blur-sm",
          )}
        >
          <div className="min-w-0 space-y-1 pr-10">
            <SheetTitle className="text-left text-lg font-semibold tracking-tight text-white sm:text-xl">
              {editingEmployee ? fr.caisseEmployee.sheetEditTitle : fr.caisseEmployee.sheetAddTitle}
            </SheetTitle>
            <SheetDescription className={cn("text-left text-sm font-medium leading-snug", MUTED)}>
              {editingEmployee ? fr.caisseEmployee.sheetEditDesc : fr.caisseEmployee.sheetAddDesc}
            </SheetDescription>
          </div>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className={cn(
              "absolute right-4 top-4 flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
              BORDER,
              "bg-[#1f2937]/80 text-[#94a3b8] hover:border-white/15 hover:bg-[#1f2937] hover:text-white",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40",
            )}
            aria-label={fr.common.close}
          >
            <X className="size-5" />
          </button>
        </header>

        <form id={formId} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-5 sm:px-6 sm:py-6">
            <div className="space-y-6 pb-2">
              {/* Section 1 */}
              <section className={sectionCard}>
                <h3 className="text-sm font-semibold tracking-tight text-white">Employee information</h3>
                <p className={cn("mt-1 text-xs font-medium", MUTED)}>Basic profile used across the POS.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-name">
                      Full name <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      id="emp-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={cn(fieldClass, errors.fullName && "border-rose-500/50 ring-1 ring-rose-500/20")}
                      placeholder="e.g. Sarah Benali"
                      autoComplete="name"
                    />
                    {errors.fullName ? <p className="text-xs font-medium text-rose-400">{errors.fullName}</p> : null}
                  </div>
                  <div className="space-y-1.5 sm:col-span-1">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-phone">
                      Phone number <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      id="emp-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className={cn(fieldClass, errors.phone && "border-rose-500/50 ring-1 ring-rose-500/20")}
                      placeholder="+213 …"
                      inputMode="tel"
                      autoComplete="tel"
                    />
                    {errors.phone ? <p className="text-xs font-medium text-rose-400">{errors.phone}</p> : null}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-email">
                      Email
                    </label>
                    <Input
                      id="emp-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={cn(fieldClass, errors.email && "border-rose-500/50 ring-1 ring-rose-500/20")}
                      placeholder="name@restaurant.com"
                      autoComplete="email"
                    />
                    {errors.email ? <p className="text-xs font-medium text-rose-400">{errors.email}</p> : null}
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div
                    className={cn(
                      "relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed",
                      BORDER,
                      INPUT_BG,
                    )}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt="" className="size-full object-cover" />
                    ) : (
                      <span className={cn("text-xs font-semibold", MUTED)}>Preview</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className={cn("text-xs font-semibold", LABEL)}>Profile picture</p>
                    <p className={cn("text-xs font-medium leading-relaxed", MUTED)}>PNG or JPG. Drag and drop or upload.</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => setPhotoFromFile(e.target.files?.[0] ?? null)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          "h-9 gap-2 rounded-xl border font-semibold",
                          BORDER,
                          "bg-[#1f2937]/80 text-white hover:bg-[#273549] hover:text-white",
                        )}
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload className="size-3.5" />
                        Upload
                      </Button>
                      {photoFile ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-9 text-[#94a3b8] hover:text-white"
                          onClick={() => setPhotoFromFile(null)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "mt-4 flex min-h-[88px] cursor-default flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-6 text-center transition-colors",
                    BORDER,
                    "bg-[#0f172a]/40 hover:border-white/12 hover:bg-[#0f172a]/55",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setPhotoFromFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                >
                  <p className={cn("text-xs font-semibold text-white")}>Drop an image here</p>
                  <p className={cn("mt-1 text-[11px] font-medium", MUTED)}>Optional — max recommended 2&nbsp;MB</p>
                </div>
              </section>

              {/* Section 2 */}
              <section className={sectionCard}>
                <h3 className="text-sm font-semibold text-white">Role</h3>
                <div className="mt-4 space-y-1.5">
                  <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-role">
                    Select role <span className="text-rose-400">*</span>
                  </label>
                  <select
                    id="emp-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={cn(fieldClass, "h-11 cursor-pointer appearance-none font-medium", errors.role && "border-rose-500/50")}
                  >
                    <option value="" className="bg-[#111827] text-[#94a3b8]">
                      Choose…
                    </option>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r} className="bg-[#111827] text-white">
                        {r}
                      </option>
                    ))}
                  </select>
                  {errors.role ? <p className="text-xs font-medium text-rose-400">{errors.role}</p> : null}
                </div>
              </section>

              {/* Section 3 */}
              <section className={sectionCard}>
                <h3 className="text-sm font-semibold text-white">Login access</h3>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-user">
                      Username <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      id="emp-user"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className={cn(fieldClass, errors.username && "border-rose-500/50 ring-1 ring-rose-500/20")}
                      placeholder="login id"
                      autoComplete="username"
                    />
                    {errors.username ? <p className="text-xs font-medium text-rose-400">{errors.username}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-pin">
                      4-digit PIN <span className="text-rose-400">*</span>
                    </label>
                    <Input
                      id="emp-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      className={cn(
                        fieldClass,
                        "text-center font-mono text-lg tracking-[0.35em]",
                        errors.pin && "border-rose-500/50 ring-1 ring-rose-500/20",
                      )}
                      placeholder="••••"
                      autoComplete="one-time-code"
                    />
                    {errors.pin ? <p className="text-xs font-medium text-rose-400">{errors.pin}</p> : null}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-pass">
                      Password <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        id="emp-pass"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={cn(fieldClass, "pr-11", errors.password && "border-rose-500/50 ring-1 ring-rose-500/20")}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#94a3b8] transition-colors hover:bg-white/5 hover:text-white"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {errors.password ? <p className="text-xs font-medium text-rose-400">{errors.password}</p> : null}
                  </div>
                </div>
              </section>

              {/* Section 4 */}
              <section className={sectionCard}>
                <h3 className="text-sm font-semibold text-white">Permissions</h3>
                <p className={cn("mt-1 text-xs font-medium", MUTED)}>Fine-grained access for this workstation profile.</p>
                <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {PERMISSIONS.map((p) => {
                    const on = permissions[p.id];
                    return (
                      <label
                        key={p.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-[border-color,background-color,box-shadow]",
                          BORDER,
                          on ? "border-violet-500/35 bg-violet-500/[0.08] shadow-[0_0_0_1px_rgba(139,92,246,0.12)]" : "bg-[#0f172a]/35 hover:border-white/12 hover:bg-[#0f172a]/50",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePermission(p.id)}
                          className="mt-0.5 size-4 shrink-0 rounded border-white/20 bg-[#1f2937] text-violet-500 focus:ring-violet-500/30"
                        />
                        <span className={cn("text-sm font-semibold leading-snug", on ? "text-white" : "text-[#e2e8f0]")}>{p.label}</span>
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* Section 5 */}
              <section className={sectionCard}>
                <h3 className="text-sm font-semibold text-white">Shift settings</h3>
                <p className={cn("mt-1 text-xs font-medium", MUTED)}>Scheduling template for reporting.</p>
                <p className={cn("mt-4 text-xs font-semibold", LABEL)}>Shift type</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      { id: "morning" as const, label: "Morning" },
                      { id: "evening" as const, label: "Evening" },
                      { id: "night" as const, label: "Night" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShiftType(opt.id)}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-xs font-semibold transition-all",
                        BORDER,
                        shiftType === opt.id
                          ? "border-violet-500/40 bg-gradient-to-r from-violet-600/25 to-fuchsia-600/20 text-white shadow-[0_0_20px_-8px_rgba(139,92,246,0.45)]"
                          : "bg-[#1f2937]/50 text-[#cbd5e1] hover:border-white/12 hover:bg-[#1f2937]",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-start">
                      Start time
                    </label>
                    <Input
                      id="emp-start"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={cn(fieldClass, errors.startTime && "border-rose-500/50")}
                    />
                    {errors.startTime ? <p className="text-xs text-rose-400">{errors.startTime}</p> : null}
                  </div>
                  <div className="space-y-1.5">
                    <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-end">
                      End time
                    </label>
                    <Input
                      id="emp-end"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className={cn(fieldClass, errors.endTime && "border-rose-500/50")}
                    />
                    {errors.endTime ? <p className="text-xs text-rose-400">{errors.endTime}</p> : null}
                  </div>
                </div>
              </section>

              {/* Section 6 */}
              <section className={sectionCard}>
                <h3 className="text-sm font-semibold text-white">Salary</h3>
                <p className={cn("mt-1 text-xs font-medium", MUTED)}>Amount in Algerian dinars (DA).</p>
                <p className={cn("mt-4 text-xs font-semibold", LABEL)}>Salary type</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      { id: "monthly" as const, label: "Monthly" },
                      { id: "weekly" as const, label: "Weekly" },
                      { id: "daily" as const, label: "Daily" },
                      { id: "hourly" as const, label: "Hourly" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSalaryType(opt.id)}
                      className={cn(
                        "rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all",
                        BORDER,
                        salaryType === opt.id
                          ? "border-fuchsia-500/35 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 text-white"
                          : "bg-[#1f2937]/50 text-[#cbd5e1] hover:border-white/12 hover:bg-[#1f2937]",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="mt-4 space-y-1.5">
                  <label className={cn("text-xs font-semibold", LABEL)} htmlFor="emp-salary">
                    Salary amount (DA)
                  </label>
                  <Input
                    id="emp-salary"
                    value={salaryRaw}
                    onChange={(e) => setSalaryRaw(e.target.value)}
                    className={cn(fieldClass, "font-mono tabular-nums", errors.salary && "border-rose-500/50 ring-1 ring-rose-500/20")}
                    placeholder="e.g. 85000"
                    inputMode="numeric"
                  />
                  {errors.salary ? <p className="text-xs font-medium text-rose-400">{errors.salary}</p> : null}
                </div>
              </section>

              {/* Section 7 */}
              <section className={sectionCard}>
                <h3 className="text-sm font-semibold text-white">Employee status</h3>
                <div className="mt-4 inline-flex rounded-2xl border p-1" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                  {(
                    [
                      { id: "active" as const, label: "Active" },
                      { id: "suspended" as const, label: "Suspended" },
                      { id: "vacation" as const, label: "Vacation" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEmploymentStatus(opt.id)}
                      className={cn(
                        "rounded-xl px-4 py-2 text-xs font-semibold transition-all",
                        employmentStatus === opt.id
                          ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_4px_24px_-8px_rgba(168,85,247,0.55)]"
                          : "text-[#94a3b8] hover:text-white",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </div>

          <footer
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-t px-5 py-4 sm:px-6",
              BORDER,
              "bg-[#111827]/95 backdrop-blur-sm",
            )}
          >
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              className={cn(
                "h-11 rounded-xl border px-5 font-semibold",
                BORDER,
                "border-white/[0.08] bg-[#1f2937] text-white hover:bg-[#273549] hover:text-white",
              )}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={saving}
              className={cn(
                "relative h-11 min-w-[10.5rem] overflow-hidden rounded-xl border-0 px-6 text-sm font-semibold text-white shadow-lg",
                "bg-gradient-to-r from-violet-600 to-fuchsia-600",
                "hover:from-violet-500 hover:to-fuchsia-500",
                "shadow-[0_8px_32px_-10px_rgba(168,85,247,0.55)]",
                "focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]",
                "disabled:opacity-60",
              )}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : editingEmployee ? (
                "Update Employee"
              ) : (
                "Save Employee"
              )}
            </Button>
          </footer>
        </form>
      </SheetContent>
    </Sheet>
  );
}
