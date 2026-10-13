---
verified: 2026-10-14
commit: 2f55918
---

# Training data

Input: a filter in the query string → Movement: candidate frames, label rules, split, freeze,
zip → Output: a frozen snapshot, downloaded as a zip a YOLO or COCO training run reads.

Super admins only (14zcqntm62u). The research export answers "what did the smears show"; this
answers "what should a model learn from".

## Steps

1. **Gate.** `/training-data` calls `requirePageAccess(["super_admin"])`; an org admin gets a
   404, so the page has no route-level `loading.tsx` (`../effects/CONTEXT.md`). The download
   route (`training-data/snapshots/[snapshotId]/download/route.ts:31`) and the create action
   check `TRAINING_ACCESS` again, and every database function checks again
   (`console_require_super_admin()`, `admin/0012:122`).
2. **Candidates.** `console_training_frames()` (`admin/0012:138`) returns the live frames whose
   session started in the period (Manila days), in the laboratories and model versions asked
   for, each with every detection on it, its box, and the linked prediction's box. A deleted
   duplicate is only counted. One jsonb value, not rows, so PostgREST's row cap never cuts it
   short. Security definer: a super admin's table reads return nothing since app `0013`.
3. **Label rules.** `buildTrainingSet()` (`src/domain/training-data.ts:397`) applies
   `labelFrame()` (`:304`) to each frame:
   - a detection the medtech did not reject, with a box, of a selected species, is a label,
     classed by the medtech's correction or else the model's, by canonical name. An untouched
     model box the medtech confirmed is a label like any other;
   - a rejected one (`FALSE_POSITIVE`) is a hard negative at the model's position: manifest
     only, never a YOLO line;
   - **a frame goes in whole or not at all.** An egg counted but never boxed, a box wholly
     outside the frame, or a species the model is not trained on leaves the frame out, because
     kept, that egg would be taught as background. So does a frame flagged for
     re-annotation, unless asked for. The ticket said to drop only the box-less detection;
     dropping the frame is the stricter reading of the same rule, for that reason;
   - **unless asked for (`includeUnboxed`, off by default).** "Frames with unboxed eggs" keeps a
     frame whose only problem is eggs counted but never boxed: it goes in with the boxes it
     has and `unboxedEggs`, the number it lacks, frozen with it (`admin/0013`). It is
     **incomplete**, never background, even with no box at all: there is an egg on it. A frame
     with another reason to leave is still left out;
   - a frame with no label is a background image, unless switched off. Boxes of a species not
     selected are dropped and the frame stays: a detector for the selected species should
     learn those eggs are not it.

   Boxes are clipped to the 640×640 frame (`clipToFrame`, `:248`).

4. **Split by patient.** `splitFor()` (`:229`) buckets a patient by the first eight hex digits
   of an md5 of their id: test takes the lowest buckets, validation the next, training the
   rest (default 15/15/70). Fixed, not random: a patient stays in the same split in every
   snapshot with the same percentages, so a test patient never leaks into a later training
   set, and raising validation never moves a test patient.
5. **Preview.** The page renders the summary (frames, boxes, background, hard negatives,
   patients; by split, class, model version and laboratory; what was left out and why) before
   anything is written. With unboxed frames included, a warning gives how many frames and eggs
   are incomplete, and the split table an Incomplete column.
6. **Freeze.** The create action reads the frames again from the same query, never from the
   browser, and calls `console_create_training_snapshot()` (`admin/0012`, replaced by
   `admin/0013`). It stores the filter, the summary and each frame's labels, hard negatives and
   unboxed-egg count as values, copies the storage
   path and model version from the sample row, and refuses the whole snapshot (22023, hint
   `stale`) if a frame was deleted since. The patient key becomes a group code hashed with a
   salt made for that snapshot and never stored. Audited as `training.snapshot.create` in the
   same transaction.
7. **Download.** The route reads the snapshot (`console_training_snapshot()`), records
   `training.snapshot.download` (`:48`) and serves nothing if that fails, then streams the zip
   (`trainingZipStream`, `src/lib/training-zip.ts:25`).

## The zip

- `images/{train,val,test}/<sample_id>.jpg`, read from the `samples` bucket **as the signed-in
  super admin** (`StoragePort.download`), whom the bucket's `"samples: admin read all"` policy
  lets read every frame. No service-role key; constraint #2 is unchanged.
- `labels/{train,val,test}/<sample_id>.txt`: YOLO, `class cx cy w h`, pixels ÷ 640, six
  decimals; empty for a background frame. An incomplete frame's file holds only its boxed eggs
  (maybe none), so a training run that reads it learns its unboxed eggs as background.
- `data.yaml`, `annotations.coco.json` (top-left boxes in pixels, categories from 1, each
  image with its split and `incomplete`), `manifest.jsonl` (per frame: split, model version,
  laboratory code, patient group, `incomplete` and `unboxed_eggs`, labels with origin `kept` /
  `redrawn` / `added` / `unknown`, verdict and the model's class, hard negatives), and
  `README.md`, the data card, which counts incomplete frames per split and, when there are any,
  says to leave them out of training or use them only where a missing box does no harm.

Images are written as they are, text deflated. The stream reads six images ahead and only as
the client takes bytes, so memory stays flat. An image that cannot be read is left out with its
label file and manifest line, and the data card lists it.

## Privacy

Frames are named by sample id. No patient name, birthdate, sex, barangay, session label, note,
medtech or laboratory id reaches the file: the storage path (`{user_id}/…`) stays on the
server, laboratories are `LAB-` and six hex digits of an md5 of their id (the same code in
every snapshot), and the patient group links frames within one snapshot only. Location stays
out entirely: per-frame rows with a barangay would get around the small-cell suppression
(threshold 5) that the app's `barangay_prevalence()` applies to the map.

## Frozen

A snapshot's labels are values, so a medtech re-opening a sample changes nothing in it. Both
tables refuse UPDATE, DELETE and TRUNCATE for every role (C8), and no client role holds a
privilege on them. The images are not copied: they are read from the bucket at download time.

## Limits

At most 20,000 frames (`TRAINING_SNAPSHOT_LIMIT`, `src/domain/training-data.ts:45`), checked
in the action and the database, which keeps the zip under the format's 65,535 entries without
ZIP64. The route allows 300 s (`maxDuration`). Frames average about 33 KB, so 20,000 come to
about 660 MB; if a full snapshot runs into the host's limits, the fallback is a manifest with
short-lived signed URLs.

## If you change this

**Hits**

- Every training run built on an earlier snapshot: the YOLO, COCO and manifest formats are a
  contract. A change to the label rules changes only snapshots made after it.
- `src/domain/training-data.test.ts`, `training-export.test.ts`,
  `src/lib/training-zip.test.ts`, and `supabase/tests/admin_0012_training_snapshots.test.ts`,
  which runs the rules on rows the database returns, checks the split, the freeze, the audit
  entries and who is refused.
- The split rule: changing `splitFor` moves patients between splits across snapshots.

- **Before `admin/0013`** the option is not offered: `trainingSupportsUnboxed()` asks
  `console_training_schema_version()`, the checkbox is disabled with a note, the page treats
  the option as off, and the create action refuses it. Without that guard a frame would be
  stored without its incomplete mark. `supabase/tests/admin_0013_training_unboxed_frames.test.ts`
  covers the stored count.

**Does not hit**

- The dashboard, records and research export: nothing here changes what a smear counts as.

## See

`supabase/migrations/admin/0012_training_snapshots.sql`, `src/domain/training-data.ts`,
`src/domain/training-export.ts`, `src/lib/training-zip.ts`, `src/app/(dashboard)/training-data/`,
`src/components/training/`.
