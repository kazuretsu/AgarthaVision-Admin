import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminWriteError } from "@/ports/admin-write";
import { changeLaboratoryLogo, renameLaboratory } from "./laboratory-branding-actions";
import { EMPTY_PROFILE_FORM } from "./state";

const { getConsoleActor, rename, setLogo, revalidatePath } = vi.hoisted(() => ({
  getConsoleActor: vi.fn(),
  rename: vi.fn(),
  setLogo: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/console-access", () => ({ getConsoleActor }));
vi.mock("@/adapters/registry", () => ({
  getAdminWrites: async () => ({ renameMyLaboratory: rename, setMyLaboratoryLogo: setLogo }),
}));

function logoForm(bytes: Buffer): FormData {
  const data = new FormData();
  data.set("logo", new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" }));
  data.set("organizationId", "another-laboratory");
  return data;
}

function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "white" } })
    .png()
    .toBuffer();
}

describe("laboratory branding actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getConsoleActor.mockResolvedValue({ access: { kind: "org_admin" } });
  });

  it("normalizes the name and leaves laboratory selection to the current membership", async () => {
    const data = new FormData();
    data.set("name", "  Cebu   Health Laboratory ");
    data.set("organizationId", "another-laboratory");

    await expect(renameLaboratory(EMPTY_PROFILE_FORM, data)).resolves.toMatchObject({
      error: null,
    });
    expect(rename).toHaveBeenCalledExactlyOnceWith("Cebu Health Laboratory");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("refuses a user without an organization admin membership", async () => {
    getConsoleActor.mockResolvedValue({ access: { kind: "super_admin" } });

    await expect(changeLaboratoryLogo(EMPTY_PROFILE_FORM, new FormData())).resolves.toMatchObject({
      error: expect.stringContaining("Only an organization admin"),
    });
    expect(setLogo).not.toHaveBeenCalled();
  });

  it("adds or replaces a valid PNG and revalidates Settings", async () => {
    const logo = await png(512, 128);

    await expect(changeLaboratoryLogo(EMPTY_PROFILE_FORM, logoForm(logo))).resolves.toEqual({
      error: null,
      done: "Laboratory logo saved.",
    });
    expect(setLogo).toHaveBeenCalledExactlyOnceWith(logo.toString("base64"));
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("rejects a spoofed file, an out-of-bounds PNG and a corrupted PNG before replacing the logo", async () => {
    const valid = await png(20, 20);
    const corrupt = Buffer.from(valid);
    const imageData = corrupt.indexOf("IDAT");
    corrupt.fill(0, imageData + 4, imageData + 8);
    const invalidFiles = [
      Buffer.from("<svg></svg>"),
      Buffer.alloc(131_073),
      await png(513, 20),
      corrupt,
    ];

    for (const invalid of invalidFiles) {
      await expect(
        changeLaboratoryLogo(EMPTY_PROFILE_FORM, logoForm(invalid)),
      ).resolves.toMatchObject({
        error: expect.stringContaining("Choose a PNG logo"),
      });
    }
    expect(setLogo).not.toHaveBeenCalled();
  });

  it("sends explicit null when removing a logo", async () => {
    const data = new FormData();
    data.set("removeLogo", "1");

    await expect(changeLaboratoryLogo(EMPTY_PROFILE_FORM, data)).resolves.toEqual({
      error: null,
      done: "Laboratory logo removed.",
    });
    expect(setLogo).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("reports a write rejected by the database without reporting success", async () => {
    const data = new FormData();
    data.set("removeLogo", "1");
    setLogo.mockRejectedValue(new AdminWriteError("forbidden", "set_my_laboratory_logo"));

    await expect(changeLaboratoryLogo(EMPTY_PROFILE_FORM, data)).resolves.toMatchObject({
      error: expect.stringContaining("Only an organization admin"),
      done: null,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
