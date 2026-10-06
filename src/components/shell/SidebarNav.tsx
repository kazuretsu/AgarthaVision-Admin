"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileDown, History, LayoutDashboard, Microscope, Users } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

const ICONS = {
  dashboard: LayoutDashboard,
  records: Microscope,
  export: FileDown,
  people: Users,
  organizations: Building2,
  audit: History,
} as const;

/**
 * The item's icon, or a spinner while its page is on the way: the click shows at
 * once, before any skeleton can (14zcqntk6h5). Must render inside the `<Link>`.
 */
function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  const { pending } = useLinkStatus();
  const Icon = ICONS[icon];
  return pending ? (
    <Spinner aria-label="Opening…" className="size-4" />
  ) : (
    <Icon className="size-4" aria-hidden />
  );
}

/** The sidebar links, marking the section the visitor is in. */
export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Console" className="flex flex-col gap-1">
      {items.map((item) => {
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
            <NavIcon icon={item.icon} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
