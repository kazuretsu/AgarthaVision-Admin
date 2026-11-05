"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { HUMAN_CHECK_FIELD } from "@/domain/human-check";

/**
 * Cloudflare Turnstile on the sign-in and invitation forms (14zcqntnqpc).
 *
 * Not a shadcn component: Turnstile draws its own iframe, and the registry has nothing for
 * it, like the prevalence map. This file only mounts the widget and keeps its token in a
 * hidden field; the provider verifies the token when the server action signs in.
 *
 * With no site key in the build (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, inlined at build time)
 * nothing renders and no token is sent, which works only while the provider's check is off.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface HumanCheckState {
  /** Whether this build asks for the check at all. */
  required: boolean;
  /** The current token, or "" while there is none. */
  token: string;
  setToken: (token: string) => void;
  widgetRef: RefObject<string | null>;
  /**
   * Call as the form is submitted. A token is single-use, so the widget runs again for the
   * next attempt; the submitted form data already holds this one.
   */
  consume: () => void;
}

export function useHumanCheck(): HumanCheckState {
  const [token, setToken] = useState("");
  const widgetRef = useRef<string | null>(null);
  const consume = useCallback(() => {
    if (widgetRef.current !== null) window.turnstile?.reset(widgetRef.current);
    setToken("");
  }, []);
  return { required: SITE_KEY !== "", token, setToken, widgetRef, consume };
}

/**
 * The widget and its hidden field. `action` labels the form in Cloudflare's analytics
 * (lower-case letters, digits, `-` and `_`).
 */
export function HumanCheck({ check, action }: { check: HumanCheckState; action: string }) {
  const container = useRef<HTMLDivElement>(null);
  const { widgetRef, setToken } = check;

  const mount = useCallback(() => {
    const turnstile = window.turnstile;
    if (!turnstile || !container.current || widgetRef.current !== null) return;
    widgetRef.current =
      turnstile.render(container.current, {
        sitekey: SITE_KEY,
        action,
        // The console's theme (next-themes puts `dark` on <html>), not the system's.
        theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
        size: "flexible",
        // The token travels in the hidden field below, which this component controls.
        "response-field": false,
        callback: (issued: string) => setToken(issued),
        "expired-callback": () => setToken(""),
        "timeout-callback": () => setToken(""),
        "error-callback": () => setToken(""),
      }) ?? null;
  }, [action, setToken, widgetRef]);

  useEffect(() => {
    mount();
    return () => {
      if (widgetRef.current !== null) window.turnstile?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [mount, widgetRef]);

  if (!check.required) return null;

  return (
    <>
      <Script src={SCRIPT_URL} strategy="afterInteractive" onReady={mount} />
      <div ref={container} className="min-h-[65px]" />
      <input type="hidden" name={HUMAN_CHECK_FIELD} value={check.token} />
    </>
  );
}
