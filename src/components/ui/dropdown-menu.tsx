"use client";

import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

/** shadcn dropdown menu on Base UI's `Menu` (D1: Base UI, not Radix). */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: Menu.Popup.Props & Pick<Menu.Positioner.Props, "align" | "sideOffset">) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
        <Menu.Popup
          className={cn(
            "min-w-48 rounded-[10px] border border-stone-hair bg-surface p-1 text-[13px] text-stone-deep shadow-lg outline-none",
            className,
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: Menu.Item.Props) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-default items-center gap-2 rounded-[6px] px-2 py-1.5 outline-none select-none data-[highlighted]:bg-surface-sunken data-[highlighted]:text-stone-ink [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: Menu.GroupLabel.Props) {
  return (
    <Menu.GroupLabel
      className={cn("px-2 py-1.5 text-[11px] font-semibold text-stone-mid", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({ className, ...props }: Menu.Separator.Props) {
  return <Menu.Separator className={cn("my-1 h-px bg-stone-hair", className)} {...props} />;
}
