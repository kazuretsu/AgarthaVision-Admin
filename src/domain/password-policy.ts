/**
 * The rules a new password has to meet (14zcqntr31d).
 *
 * The auth provider enforces them when it makes an account; they are written here too so the
 * form can show them as the person types and a refusal can name the rule that was missed. They
 * mirror Supabase Auth's settings (Authentication → Sign In / Providers → Email): minimum length
 * 12, "Lowercase, uppercase letters, digits and symbols". **Change both together**: a rule here
 * the provider does not have only misleads, and a provider rule missing here is refused with a
 * message that cannot say why.
 *
 * Leaked-password protection is off (a paid Supabase feature), so no rule here says "not a
 * common one".
 */

export type PasswordRule = "length" | "lowercase" | "uppercase" | "digit" | "symbol";

/** Counted in bytes, as the provider counts them; one per character for plain ASCII. */
export const PASSWORD_MIN = 12;

/** bcrypt, which Supabase Auth uses, reads only the first 72 bytes. */
export const PASSWORD_MAX_BYTES = 72;

/**
 * The provider's character sets, exactly: ASCII only, so "é" is not a lowercase letter and "£"
 * is not a symbol. The symbol set is Supabase's, which leaves out the backslash and the space.
 */
const CHARACTER_SETS: Record<Exclude<PasswordRule, "length">, string> = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digit: "0123456789",
  symbol: "!@#$%^&*()_+-=[]{};':\"|<>?,./`~",
};

/** The rules in the order the form lists them, each as the checklist names it. */
export const PASSWORD_RULES: readonly { rule: PasswordRule; label: string }[] = [
  { rule: "length", label: `At least ${PASSWORD_MIN} characters` },
  { rule: "lowercase", label: "A lowercase letter (a–z)" },
  { rule: "uppercase", label: "An uppercase letter (A–Z)" },
  { rule: "digit", label: "A number (0–9)" },
  { rule: "symbol", label: "A symbol, such as ! @ # ? or -" },
];

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function meets(password: string, rule: PasswordRule): boolean {
  if (rule === "length") return byteLength(password) >= PASSWORD_MIN;
  const set = CHARACTER_SETS[rule];
  return [...password].some((character) => set.includes(character));
}

/** The rules this password misses, in the checklist's order. Empty when it meets them all. */
export function passwordGaps(password: string): PasswordRule[] {
  return PASSWORD_RULES.map(({ rule }) => rule).filter((rule) => !meets(password, rule));
}

const ASK: Record<PasswordRule, string> = {
  length: `use at least ${PASSWORD_MIN} characters`,
  lowercase: "add a lowercase letter",
  uppercase: "add an uppercase letter",
  digit: "add a number",
  symbol: "add a symbol",
};

/**
 * One sentence naming what to change: "Add a symbol." or "Use at least 12 characters, add a
 * number and add a symbol." When nothing here is missed yet the provider still refused, its
 * rules and these have drifted apart; the sentence then says so without guessing.
 */
export function passwordGapMessage(gaps: readonly PasswordRule[]): string {
  if (gaps.length === 0) {
    return "This password does not meet the sign-in rules. Try a longer one with a mix of characters.";
  }
  const asks = gaps.map((rule) => ASK[rule]);
  const sentence =
    asks.length === 1 ? asks[0] : `${asks.slice(0, -1).join(", ")} and ${asks[asks.length - 1]}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
