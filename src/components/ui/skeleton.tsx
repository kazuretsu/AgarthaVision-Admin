import { cn } from "@/lib/utils";

/** shadcn skeleton: a pulsing placeholder in the shape of what is loading. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-[6px] bg-stone-hair", className)}
      {...props}
    />
  );
}
