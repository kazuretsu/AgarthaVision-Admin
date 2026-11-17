"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import {
  changeLaboratoryLogo,
  renameLaboratory,
} from "@/app/(dashboard)/settings/laboratory-branding-actions";
import { EMPTY_PROFILE_FORM } from "@/app/(dashboard)/settings/state";
import {
  LABORATORY_LOGO_MAX_DIMENSION,
  LABORATORY_LOGO_MAX_KIB,
  ORGANIZATION_NAME_MAX,
  type LaboratoryBranding,
} from "@/domain/organizations";
import { Feedback } from "@/components/invitations/InvitationForms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LaboratoryBrandingForms({ name, logoBase64 }: LaboratoryBranding) {
  const [nameState, rename, renaming] = useActionState(renameLaboratory, EMPTY_PROFILE_FORM);
  const [logoState, saveLogo, logoBusy] = useActionState(changeLaboratoryLogo, EMPTY_PROFILE_FORM);
  const [unreadableLogo, setUnreadableLogo] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <form action={rename} className="flex flex-col gap-2">
        <Label htmlFor="laboratory-name">Laboratory name</Label>
        <Input
          key={name}
          id="laboratory-name"
          name="name"
          defaultValue={name}
          maxLength={ORGANIZATION_NAME_MAX}
          required
        />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Feedback {...nameState} />
          <Button type="submit" disabled={renaming}>
            {renaming ? "Saving…" : "Save laboratory name"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-3">
        {logoBase64 && logoBase64 !== unreadableLogo ? (
          <Image
            src={`data:image/png;base64,${logoBase64}`}
            alt={`${name} logo`}
            width={80}
            height={80}
            unoptimized
            className="h-20 w-20 object-contain"
            onError={() => setUnreadableLogo(logoBase64)}
          />
        ) : (
          <p className="text-[13px] text-stone-mid">
            {logoBase64 ? "The saved logo could not be displayed." : "No logo has been added."}
          </p>
        )}
        <form action={saveLogo} className="flex flex-col gap-2">
          <Label htmlFor="laboratory-logo">Laboratory logo</Label>
          <Input
            id="laboratory-logo"
            name="logo"
            type="file"
            accept="image/png,.png"
            aria-describedby="laboratory-logo-limits"
            disabled={logoBusy}
            required
          />
          <p id="laboratory-logo-limits" className="text-[12px] text-stone-mid">
            PNG, up to {LABORATORY_LOGO_MAX_KIB} KB and {LABORATORY_LOGO_MAX_DIMENSION} ×{" "}
            {LABORATORY_LOGO_MAX_DIMENSION} pixels.
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={logoBusy}>
              {logoBase64 ? "Replace logo" : "Add logo"}
            </Button>
          </div>
        </form>
        {logoBase64 ? (
          <form action={saveLogo} className="flex justify-end">
            <input type="hidden" name="removeLogo" value="1" />
            <Button type="submit" variant="outline" disabled={logoBusy}>
              Remove logo
            </Button>
          </form>
        ) : null}
        <Feedback {...logoState} />
      </div>
    </div>
  );
}
