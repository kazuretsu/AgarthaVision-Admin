import { Separator as BaseSeparator } from "@base-ui/react/separator";
import { cn } from "@/lib/utils";

/** shadcn separator on Base UI's `Separator`. */
export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: BaseSeparator.Props) {
  return (
    <BaseSeparator
      orientation={orientation}
      className={cn(
        "shrink-0 bg-stone-hair",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
