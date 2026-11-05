"use client";

import { AlertDialog as BaseAlertDialog } from "@base-ui/react/alert-dialog";
import { cn } from "@/lib/utils";

/** shadcn alert dialog on Base UI's `AlertDialog`: a confirmation that cannot be dismissed by accident. */
export const AlertDialog = BaseAlertDialog.Root;
export const AlertDialogTrigger = BaseAlertDialog.Trigger;
export const AlertDialogClose = BaseAlertDialog.Close;

export function AlertDialogContent({ className, ...props }: BaseAlertDialog.Popup.Props) {
  return (
    <BaseAlertDialog.Portal>
      <BaseAlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/40" />
      <BaseAlertDialog.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-[12px] border border-stone-hair bg-surface p-5 shadow-xl outline-none",
          className,
        )}
        {...props}
      />
    </BaseAlertDialog.Portal>
  );
}

export function AlertDialogTitle({ className, ...props }: BaseAlertDialog.Title.Props) {
  return (
    <BaseAlertDialog.Title
      className={cn("text-[16px] font-semibold text-stone-ink", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({ className, ...props }: BaseAlertDialog.Description.Props) {
  return (
    <BaseAlertDialog.Description
      className={cn("text-[13px] text-stone-deep", className)}
      {...props}
    />
  );
}
