import { Input as BaseInput } from "@base-ui/react/input";
import { cn } from "@/lib/utils";

/** shadcn input on Base UI's `Input`. */
export function Input({ className, ...props }: BaseInput.Props) {
  return (
    <BaseInput
      className={cn(
        "h-9 w-full rounded-[8px] border border-stone-line bg-surface px-3 text-[14px] text-stone-ink outline-none placeholder:text-stone-soft focus:border-maroon",
        className,
      )}
      {...props}
    />
  );
}
