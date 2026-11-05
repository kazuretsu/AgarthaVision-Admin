"use client";

import { useActionState } from "react";
import { createTrainingSnapshot } from "@/app/(dashboard)/training-data/actions";
import { EMPTY_TRAINING_SNAPSHOT_FORM } from "@/app/(dashboard)/training-data/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Names and freezes the previewed frames. Posts the preview's own query, so the
 * snapshot is built from the filter on screen; the frames are read again on the server.
 */
export function CreateSnapshotForm({ query, disabled }: { query: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(
    createTrainingSnapshot,
    EMPTY_TRAINING_SNAPSHOT_FORM,
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="query" value={query} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-64 flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-medium text-stone-deep">Snapshot name</span>
          <Input
            name="name"
            required
            minLength={2}
            maxLength={120}
            placeholder="e.g. All labs, October 2026"
            defaultValue={state.name}
            disabled={disabled}
          />
        </label>
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Creating…" : "Create snapshot"}
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      ) : state.done ? (
        <p role="status" className="text-[13px] text-ok">
          {state.done}
        </p>
      ) : null}
    </form>
  );
}
