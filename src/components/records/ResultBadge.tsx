import { Badge } from "@/components/ui/badge";

/** Positive or negative for STH, always in words. */
export function ResultBadge({ positive }: { positive: boolean }) {
  return positive ? <Badge variant="danger">Positive</Badge> : <Badge variant="ok">Negative</Badge>;
}
