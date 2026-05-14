import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Calculator,
  ClipboardList,
  LayoutDashboard,
  Settings2,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import { PermissionCodes } from "@pos/contracts";
import { fr } from "@/lib/locale/fr";

export interface NavItemConfig {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Small pill on icon corner (e.g. overflow count). */
  iconBadge?: string;
  /** Right-aligned numeric summary (Figma trailing count). */
  count?: string;
  kbd?: string;
  /** If set, user must have at least one of these API permission codes to see the link. */
  anyOfPermissions?: string[];
}

export interface NavSectionConfig {
  label: string;
  items: NavItemConfig[];
}

export const navSections: NavSectionConfig[] = [
  {
    label: fr.nav.sectionMain,
    items: [
      { to: "/", label: fr.nav.dashboard, icon: LayoutDashboard, kbd: "Alt+1" },
      {
        to: "/tables",
        label: fr.nav.tables,
        icon: UtensilsCrossed,
        iconBadge: "9+",
        count: "12",
        anyOfPermissions: [PermissionCodes.ORDERS_READ, PermissionCodes.TABLES_MANAGE],
      },
      {
        to: "/orders",
        label: fr.nav.ordersPos,
        icon: ClipboardList,
        iconBadge: "8",
        count: "8",
        anyOfPermissions: [PermissionCodes.ORDERS_READ],
      },
    ],
  },
  {
    label: fr.nav.sectionOperations,
    items: [
      {
        to: "/takeaway",
        label: fr.nav.takeaway,
        icon: ShoppingBag,
        iconBadge: "3",
        count: "3",
        anyOfPermissions: [PermissionCodes.ORDERS_READ],
      },
      {
        to: "/caisse",
        label: fr.nav.caisse,
        icon: Calculator,
        kbd: "Alt+6",
        anyOfPermissions: [PermissionCodes.PAYMENTS_PROCESS],
      },
    ],
  },
  {
    label: fr.nav.sectionManagement,
    items: [
      {
        to: "/analytics",
        label: fr.nav.analytics,
        icon: BarChart3,
        kbd: "Alt+7",
        anyOfPermissions: [PermissionCodes.ANALYTICS_ACCESS],
      },
      {
        to: "/menu",
        label: fr.nav.menu,
        icon: BookOpen,
        kbd: "Alt+8",
        anyOfPermissions: [PermissionCodes.MENU_READ],
      },
      {
        to: "/settings",
        label: fr.nav.settings,
        icon: Settings2,
        kbd: "Alt+9",
        anyOfPermissions: [PermissionCodes.SETTINGS_READ, PermissionCodes.SETTINGS_MANAGE],
      },
    ],
  },
];
