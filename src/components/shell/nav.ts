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
  icon:
    | "dashboard"
    | "map"
    | "records"
    | "export"
    | "training"
    | "people"
    | "organizations"
    | "super_admins"
    | "audit";
  visibleTo: readonly ConsoleAccessKind[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "dashboard",
    visibleTo: ["super_admin", "org_admin"],
  },
  { href: "/map", label: "Prevalence map", icon: "map", visibleTo: ["super_admin", "org_admin"] },
  { href: "/records", label: "Records", icon: "records", visibleTo: ["super_admin", "org_admin"] },
  { href: "/export", label: "Export", icon: "export", visibleTo: ["super_admin", "org_admin"] },
  {
    href: "/training-data",
    label: "Training data",
    icon: "training",
    visibleTo: ["super_admin"],
  },
  {
    href: "/people",
    label: "People",
    icon: "people",
    visibleTo: ["super_admin", "org_admin"],
  },
  {
    href: "/organizations",
    label: "Organizations",
    icon: "organizations",
    visibleTo: ["super_admin"],
  },
  {
    href: "/super-admins",
    label: "Super admins",
    icon: "super_admins",
    visibleTo: ["super_admin"],
  },
  { href: "/audit", label: "Audit trail", icon: "audit", visibleTo: ["super_admin", "org_admin"] },
];

export function navFor(kind: ConsoleAccessKind): NavItem[] {
  return NAV_ITEMS.filter((item) => item.visibleTo.includes(kind));
}

/** Whether a path is a section's own page or one below it. */
export function inSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The section a path belongs to, among the visitor's own entries; the dashboard when it is
 * none of them (a page they cannot open, like an org admin's `/organizations`).
 */
export function sectionFor(pathname: string, items: readonly NavItem[]): NavItem {
  return (
    items.find((item) => inSection(pathname, item.href)) ??
    items.find((item) => item.href === "/dashboard") ??
    NAV_ITEMS[0]
  );
}
