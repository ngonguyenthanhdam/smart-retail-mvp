import {
  BarChart3,
  Bell,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  Package,
  ReceiptText,
  RefreshCw,
  Store,
  Upload,
  Users,
} from "lucide-react";

import type { UserRole } from "@/lib/auth";

export const navigation = [
  { id: "dashboard", group: "overview", icon: LayoutDashboard },
  { id: "stores", group: "operations", icon: Store },
  { id: "users", group: "operations", icon: Users },
  { id: "products", group: "operations", icon: Package },
  { id: "inventory", group: "operations", icon: Boxes },
  { id: "purchases", group: "operations", icon: ClipboardList },
  { id: "sales", group: "operations", icon: ReceiptText },
  { id: "expenses", group: "operations", icon: CircleDollarSign },
  { id: "imports", group: "operations", icon: Upload },
  { id: "forecasts", group: "planning", icon: BarChart3 },
  { id: "replenishment", group: "planning", icon: RefreshCw },
  { id: "alerts", group: "planning", icon: Bell },
] as const;

export type SectionId = (typeof navigation)[number]["id"];
export type NavigationGroup = (typeof navigation)[number]["group"];

export const navigationGroups: readonly NavigationGroup[] = [
  "overview",
  "operations",
  "planning",
];

export function findSection(value: string) {
  return navigation.find((section) => section.id === value);
}

export function canAccessSection(role: UserRole, section: SectionId): boolean {
  if (role === "ADMIN") return true;
  if (role === "STORE_MANAGER") return section !== "stores" && section !== "users" && section !== "imports";
  return role === "STAFF" && (section === "products" || section === "inventory" || section === "sales");
}

export function defaultRoute(role: UserRole): string {
  return role === "STAFF" ? "/sales" : "/dashboard";
}
