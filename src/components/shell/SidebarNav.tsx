"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileDown, LayoutDashboard, Microscope } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

const ICONS = {
  dashboard: LayoutDashboard,
  records: Microscope,
  export: FileDown,
  organizations: Building2,
} as const;

/** The sidebar links, marking the section the visitor is in. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-maroon-tint text-maroon"
                : "text-stone-deep hover:bg-surface-sunken hover:text-stone-ink",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
