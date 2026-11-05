/** A labelled value in a record header. */
export function Fact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-[0.1em] text-stone-mid uppercase">
        {label}
      </span>
      <span className={`text-[14px] break-words text-stone-ink ${mono ? "tnum" : ""}`}>
        {value}
      </span>
    </div>
  );
}
