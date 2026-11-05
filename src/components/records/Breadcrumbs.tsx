import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Where this page sits in Patient → Session → Sample. The last crumb is the page. */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-[12px] text-stone-mid">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight className="size-3" aria-hidden /> : null}
            {item.href ? (
              <Link href={item.href} className="hover:text-maroon">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-stone-deep">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
