import { notFound } from "next/navigation";

/**
 * Any path no other route matches, such as `/recordsx` or `/records/nothing/here`. It sits inside
 * the console, so the layout's gate runs first (a signed-out visitor goes to sign in), and it
 * answers with the console's own 404 page, in the shell, with a way back to the visitor's
 * section, not the framework's bare one. The more specific routes always win over it.
 */
export default function MissingPage(): never {
  notFound();
}
