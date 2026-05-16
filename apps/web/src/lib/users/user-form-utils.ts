import type { AddCaisseEmployeeInput } from "@/components/caisse/caisse-store";
import type { CaisseEmployee } from "@/components/caisse/caisse-financial-types";
import { fr } from "@/lib/locale/fr";

export type ApiUserRole = "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
export type ApiUserStatus = "ACTIVE" | "INVITED" | "SUSPENDED" | "VACATION" | "DEACTIVATED";

/** Row shape returned by `GET /users` (subset used by Settings / Caisse). */
export type ApiUserListRow = {
  id: string;
  fullName: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  status?: string;
  createdAt?: string;
  roles?: { role?: { id?: string; code?: string; name?: string } }[];
};

export function mapCaisseRoleToApiRole(roleLabel: string): ApiUserRole {
  const r = roleLabel.trim().toLowerCase();
  if (r.includes("admin")) return "ADMIN";
  if (r.includes("manager") || r.includes("gérant")) return "MANAGER";
  if (r.includes("caiss")) return "CASHIER";
  return "WAITER";
}

export function mapEmploymentToUserStatus(
  employment: AddCaisseEmployeeInput["employmentStatus"],
): ApiUserStatus {
  if (employment === "vacation") return "VACATION";
  if (employment === "suspended") return "SUSPENDED";
  return "ACTIVE";
}

export function slugUsername(fullName: string): string {
  const base = fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return (base || "user").slice(0, 32);
}

export function buildUserCreateBody(input: AddCaisseEmployeeInput) {
  const password = input.password?.trim();
  if (!password) {
    throw new Error("Mot de passe requis pour créer un utilisateur.");
  }
  return {
    fullName: input.fullName.trim(),
    username: (input.username?.trim() || slugUsername(input.fullName)).slice(0, 64),
    password,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    role: mapCaisseRoleToApiRole(input.role),
    status: mapEmploymentToUserStatus(input.employmentStatus),
  };
}

export function buildUserPatchBody(input: AddCaisseEmployeeInput) {
  const body: {
    fullName: string;
    username?: string;
    phone?: string;
    email?: string;
    role: ReturnType<typeof mapCaisseRoleToApiRole>;
    status: ReturnType<typeof mapEmploymentToUserStatus>;
    password?: string;
  } = {
    fullName: input.fullName.trim(),
    ...(input.username?.trim() ? { username: input.username.trim().slice(0, 64) } : {}),
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    role: mapCaisseRoleToApiRole(input.role),
    status: mapEmploymentToUserStatus(input.employmentStatus),
  };
  const pw = input.password?.trim();
  if (pw) body.password = pw;
  return body;
}

export function mapApiUserToCaisseEmployee(u: ApiUserListRow): CaisseEmployee {
  const statusRaw = String(u.status ?? "ACTIVE").toUpperCase();
  let status: CaisseEmployee["status"] = "active";
  if (statusRaw === "VACATION") status = "break";
  else if (statusRaw === "SUSPENDED" || statusRaw === "DEACTIVATED") status = "off";

  const roleName = u.roles?.[0]?.role?.name ?? fr.caisseEmployee.roles.waiter;

  return {
    id: u.id,
    name: u.fullName,
    role: roleName,
    status,
    avatarInitials: u.fullName.slice(0, 2).toUpperCase(),
    avatarGradient: "from-blue-500 to-indigo-500",
    contributionWeight: 0,
    performanceScore: 0,
  };
}

export function readReceiptLinesFromSettingsJson(sj: Record<string, unknown> | null | undefined): {
  header: string;
  footer: string;
} {
  if (!sj) return { header: "", footer: "" };
  const receipt = sj.receipt;
  if (receipt && typeof receipt === "object") {
    const r = receipt as { headerLines?: unknown; footerLines?: unknown };
    const header = Array.isArray(r.headerLines) ? r.headerLines.map(String).join("\n") : "";
    const footer = Array.isArray(r.footerLines) ? r.footerLines.map(String).join("\n") : "";
    return { header, footer };
  }
  return {
    header: typeof sj.receiptHeader === "string" ? sj.receiptHeader : "",
    footer: typeof sj.receiptFooter === "string" ? sj.receiptFooter : "",
  };
}

export function buildReceiptSettingsPatch(header: string, footer: string, existingJson: Record<string, unknown> = {}) {
  const prevReceipt =
    existingJson.receipt && typeof existingJson.receipt === "object"
      ? (existingJson.receipt as Record<string, unknown>)
      : {};
  return {
    receipt: {
      ...prevReceipt,
      headerLines: header
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
      footerLines: footer
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    },
  };
}
