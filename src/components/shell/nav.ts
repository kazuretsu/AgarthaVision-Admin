import type { ConsoleAccessKind } from "@/domain/access";

/**
 * The console's sidebar. Each entry names who sees it.
 *
 * Visibility here is presentation only. The page behind each link repeats the
 * check with `requirePageAccess()`, so removing an entry from this list — or a
 * visitor typing its URL — never changes who can open it.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "records" | "export" | "medtechs" | "organizations" | "audit";
  visibleTo: readonly ConsoleAccessKind[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "dashboard",
    visibleTo: ["super_admin", "org_admin"],
  },
  { href: "/records", label: "Records", icon: "records", visibleTo: ["super_admin", "org_admin"] },
  { href: "/export", label: "Export", icon: "export", visibleTo: ["super_admin", "org_admin"] },
  { href: "/medtechs", label: "Medtechs", icon: "medtechs", visibleTo: ["org_admin"] },
  {
    href: "/organizations",
    label: "Organizations",
    icon: "organizations",
    visibleTo: ["super_admin"],
  },
  { href: "/audit", label: "Audit trail", icon: "audit", visibleTo: ["super_admin", "org_admin"] },
];

export function navFor(kind: ConsoleAccessKind): NavItem[] {
  return NAV_ITEMS.filter((item) => item.visibleTo.includes(kind));
}
