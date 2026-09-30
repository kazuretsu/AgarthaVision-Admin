"use client";

import { startTransition } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Who is signed in, the theme, and sign out.
 *
 * Sign out calls the server action directly; the session never touches the
 * client, and the action's redirect takes the visitor to the sign-in page.
 */
export function UserMenu({
  name,
  roleLabel,
  organizationName,
  signOutAction,
}: {
  name: string;
  roleLabel: string;
  organizationName: string | null;
  signOutAction: () => Promise<void>;
}) {
  const { setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left outline-none hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-maroon/40">
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold text-stone-ink">{name}</span>
          <span className="text-[11px] text-stone-mid">
            {roleLabel}
            {organizationName ? ` · ${organizationName}` : ""}
          </span>
        </span>
        <ChevronDown className="size-4 text-stone-mid" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun aria-hidden /> Light
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon aria-hidden /> Dark
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor aria-hidden /> System
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => startTransition(() => signOutAction())}>
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
