import { UNKNOWN_ORGANIZATION } from "@/domain";

/** Shown in place of a page's figures or list when `org` names no organization. */
export function UnknownOrganizationNotice() {
  return (
    <p
      role="alert"
      data-testid="unknown-organization"
      className="rounded-[10px] bg-warn-tint px-4 py-2 text-[13px] text-warn"
    >
      {UNKNOWN_ORGANIZATION}
    </p>
  );
}
