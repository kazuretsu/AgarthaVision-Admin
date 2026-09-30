import type { OrganizationSummary, ReadScope } from "@/domain";

/**
 * A super admin's "which laboratory" choice, submitted with the page's own GET
 * form as `org`. Org admins never see it: their scope is fixed by who they are.
 */
export function OrganizationFilter({
  organizations,
  scope,
}: {
  organizations: OrganizationSummary[];
  scope: ReadScope;
}) {
  const selected = scope.kind === "organization" ? scope.organizationId : "";
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-stone-deep">Organization</span>
      <select
        name="org"
        defaultValue={selected}
        className="h-9 rounded-[8px] border border-stone-line bg-surface px-2 text-[14px] text-stone-ink outline-none focus:border-maroon"
      >
        <option value="">All organizations</option>
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
            {organization.status === "deactivated" ? " (deactivated)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
