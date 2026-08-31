"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { EMPTY_LOGIN_STATE } from "./state";

/**
 * Sign-in form.
 *
 * A client component only because it needs the pending state; the credentials
 * themselves are handled entirely by the server action, so no key and no
 * provider SDK reaches the browser from this route.
 */
export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, EMPTY_LOGIN_STATE);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-mid">
          AgarthaVision
        </p>
        <h1 className="text-[26px] font-bold leading-8 text-stone-ink">Admin Console</h1>
        <p className="text-[13px] text-stone-mid">
          Administrator access only. Medical technologists use the mobile app.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-stone-deep">Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            className="rounded-[10px] border border-stone-hair bg-surface px-3 py-2 text-[14px] text-stone-ink outline-none focus:border-maroon"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-stone-deep">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="rounded-[10px] border border-stone-hair bg-surface px-3 py-2 text-[14px] text-stone-ink outline-none focus:border-maroon"
          />
        </label>

        {state.error ? (
          <p role="alert" className="text-[13px] text-maroon">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-[10px] bg-maroon px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
