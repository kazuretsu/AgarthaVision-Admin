import type { OrganizationSummary, ReadScope } from "@/domain";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

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
      <NativeSelect name="org" defaultValue={selected}>
        <NativeSelectOption value="">All organizations</NativeSelectOption>
        {organizations.map((organization) => (
          <NativeSelectOption key={organization.id} value={organization.id}>
            {organization.name}
            {organization.status === "deactivated" ? " (deactivated)" : ""}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  );
}
