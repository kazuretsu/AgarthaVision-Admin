"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/**
 * A password field with an eye button that shows what was typed and hides it again
 * (14zcqntr35e). It reveals only what this person typed into this field: no stored password
 * is ever sent to the browser, so there is none to show.
 */
export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup>
      <InputGroupInput {...props} type={shown ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          aria-controls={props.id}
          onClick={() => setShown((value) => !value)}
        >
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
