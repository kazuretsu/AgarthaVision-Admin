import sharp from "sharp";
import { LABORATORY_LOGO_MAX_DIMENSION, LABORATORY_LOGO_MAX_KIB } from "@/domain/organizations";

export const LABORATORY_LOGO_MAX_BYTES = LABORATORY_LOGO_MAX_KIB * 1024;

const PNG_HEADER = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const PNG_TRAILER = Buffer.from("0000000049454e44ae426082", "hex");

/** Checks the PNG header, dimensions and full decode before sending bytes to the RPC. */
export async function isLaboratoryLogo(bytes: Buffer): Promise<boolean> {
  if (bytes.length < 57 || bytes.length > LABORATORY_LOGO_MAX_BYTES) return false;
  if (!bytes.subarray(0, PNG_HEADER.length).equals(PNG_HEADER)) return false;
  if (!bytes.subarray(-PNG_TRAILER.length).equals(PNG_TRAILER)) return false;

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (
    width === 0 ||
    height === 0 ||
    width > LABORATORY_LOGO_MAX_DIMENSION ||
    height > LABORATORY_LOGO_MAX_DIMENSION
  ) {
    return false;
  }

  try {
    await sharp(bytes, {
      failOn: "warning",
      limitInputPixels: LABORATORY_LOGO_MAX_DIMENSION ** 2,
    }).stats();
    return true;
  } catch {
    return false;
  }
}
