"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { sectionFor, type NavItem } from "./nav";

/** A way back to the section of the console the visitor was in, among their own sections. */
export function BackToSection({ items }: { items: NavItem[] }) {
  const section = sectionFor(usePathname(), items);
  return (
    <Link href={section.href} className={buttonVariants({ variant: "outline" })}>
      <ArrowLeft aria-hidden /> Back to {section.label}
    </Link>
  );
}
