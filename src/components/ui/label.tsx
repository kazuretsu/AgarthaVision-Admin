import { cn } from "@/lib/utils";

/** shadcn label. A native `<label>` is the whole behaviour. */
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-medium text-stone-deep", className)} {...props} />;
}
