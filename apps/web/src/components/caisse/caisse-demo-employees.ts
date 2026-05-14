import type { CaisseEmployee } from "./caisse-financial-types";

export const CAISSE_DEMO_EMPLOYEES: CaisseEmployee[] = [
  {
    id: "emp-1",
    name: "Amel K.",
    role: "Caissière",
    status: "active",
    avatarInitials: "AK",
    avatarGradient: "from-violet-500 to-fuchsia-500",
    contributionWeight: 0.34,
    performanceScore: 94,
  },
  {
    id: "emp-2",
    name: "Samir B.",
    role: "Serveur",
    status: "active",
    avatarInitials: "SB",
    avatarGradient: "from-orange-500 to-amber-500",
    contributionWeight: 0.28,
    performanceScore: 88,
  },
  {
    id: "emp-3",
    name: "Lina M.",
    role: "Cuisine",
    status: "break",
    avatarInitials: "LM",
    avatarGradient: "from-emerald-500 to-teal-500",
    contributionWeight: 0.22,
    performanceScore: 91,
  },
  {
    id: "emp-4",
    name: "Hocine R.",
    role: "Manager",
    status: "off",
    avatarInitials: "HR",
    avatarGradient: "from-sky-500 to-indigo-500",
    contributionWeight: 0.16,
    performanceScore: 96,
  },
];
