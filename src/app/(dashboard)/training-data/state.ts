/**
 * The create-snapshot form's result: an error, or the snapshot just made. Separate
 * from `actions.ts` because a `"use server"` module may export only async functions.
 */
export interface TrainingSnapshotFormState {
  error: string | null;
  done: string | null;
  /** The name as typed, so a refused create gives it back instead of clearing the field. */
  name: string;
}

export const EMPTY_TRAINING_SNAPSHOT_FORM: TrainingSnapshotFormState = {
  error: null,
  done: null,
  name: "",
};
