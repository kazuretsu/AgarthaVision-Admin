import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn button, built on Base UI's `Button` rather than Radix `Slot` (D1).
 *
 * For a link styled as a button, put `buttonVariants()` on the `<Link>` itself —
 * a navigation is not a button, and Base UI's `render` prop would have to turn
 * off native button semantics to pretend otherwise.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[8px] text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-maroon/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-maroon text-primary-foreground hover:bg-maroon-hover",
        outline:
          "border border-stone-line bg-surface text-stone-deep hover:border-maroon hover:text-maroon",
        ghost: "text-stone-deep hover:bg-surface-sunken hover:text-stone-ink",
        destructive: "bg-danger text-white hover:opacity-90",
        link: "text-maroon underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-[12px]",
        lg: "h-10 px-4 text-[14px]",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = BaseButton.Props & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <BaseButton className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
