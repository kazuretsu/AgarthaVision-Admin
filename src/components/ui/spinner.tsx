import { Loader2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

/** shadcn spinner (`base` registry, lucide icon): a pending action, where a skeleton cannot show. */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
