import { redirect } from "next/navigation";

/**
 * The console has no public landing page. The dashboard's gate sends a
 * signed-out visitor to sign in, so every entry goes through one check.
 */
export default function Home() {
  redirect("/dashboard");
}
