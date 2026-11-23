"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAdminWrites } from "@/adapters/registry";
import {
  LABORATORY_LOGO_MAX_DIMENSION,
  LABORATORY_LOGO_MAX_KIB,
  normaliseOrganizationName,
} from "@/domain/organizations";
import { getConsoleActor } from "@/lib/console-access";
import { isLaboratoryLogo, LABORATORY_LOGO_MAX_BYTES } from "@/lib/laboratory-logo";
import { AdminWriteError } from "@/ports/admin-write";
import { NotAuthenticatedError, NotAuthorizedError, SecondFactorRequiredError } from "@/ports/auth";
import type { ProfileFormState } from "./state";

const NOT_PERMITTED = "Only an organization admin can change their laboratory's branding.";
const INVALID_LOGO = `Choose a PNG logo up to ${LABORATORY_LOGO_MAX_KIB} KB and ${LABORATORY_LOGO_MAX_DIMENSION} × ${LABORATORY_LOGO_MAX_DIMENSION} pixels.`;

async function changeBranding(
  change: () => Promise<ProfileFormState>,
  invalidMessage: string,
): Promise<ProfileFormState> {
  try {
    const { access } = await getConsoleActor();
    if (access.kind !== "org_admin") return { error: NOT_PERMITTED, done: null };
  } catch (cause) {
    if (cause instanceof SecondFactorRequiredError) redirect("/verify");
    if (cause instanceof NotAuthenticatedError) redirect("/login");
    if (cause instanceof NotAuthorizedError) return { error: NOT_PERMITTED, done: null };
    throw cause;
  }

  try {
    return await change();
  } catch (cause) {
    if (cause instanceof AdminWriteError) {
      if (cause.reason === "forbidden") return { error: NOT_PERMITTED, done: null };
      if (cause.reason === "conflict") {
        return { error: "Another laboratory already has that name.", done: null };
      }
      if (cause.reason === "invalid") {
        return { error: invalidMessage, done: null };
      }
    }
    console.error("Could not save laboratory branding", cause);
    return { error: "The laboratory branding could not be saved. Try again.", done: null };
  }
}

export async function renameLaboratory(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  return changeBranding(async () => {
    const name = normaliseOrganizationName(String(formData.get("name") ?? ""));
    if (!name.ok) return { error: name.error, done: null };

    await (await getAdminWrites()).renameMyLaboratory(name.name);
    revalidatePath("/", "layout");
    return { error: null, done: "Laboratory name saved." };
  }, "That laboratory name is not allowed.");
}

export async function changeLaboratoryLogo(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  return changeBranding(async () => {
    if (formData.get("removeLogo") === "1") {
      await (await getAdminWrites()).setMyLaboratoryLogo(null);
      revalidatePath("/settings");
      return { error: null, done: "Laboratory logo removed." };
    }

    const file = formData.get("logo");
    if (!(file instanceof File) || file.size > LABORATORY_LOGO_MAX_BYTES) {
      return { error: INVALID_LOGO, done: null };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (!(await isLaboratoryLogo(bytes))) return { error: INVALID_LOGO, done: null };

    await (await getAdminWrites()).setMyLaboratoryLogo(bytes.toString("base64"));
    revalidatePath("/settings");
    return { error: null, done: "Laboratory logo saved." };
  }, INVALID_LOGO);
}
