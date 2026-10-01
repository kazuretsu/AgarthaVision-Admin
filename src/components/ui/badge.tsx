import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** shadcn badge. A status chip always carries its word; color is never the message. */
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "bg-maroon-tint text-maroon",
        neutral: "bg-surface-sunken text-stone-deep",
        ok: "bg-ok-tint text-ok",
        warn: "bg-warn-tint text-warn",
        danger: "bg-danger-tint text-danger",
        gold: "bg-gold-tint text-gold-text",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
