-- admin/0012 · Training data snapshots for super admins
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0001_organizations.sql (patient_organizations, console_write_audit()), and the
-- app's 0004_predictions.sql (predictions, detections.prediction_id) and 0014_super_admins.sql
-- (is_admin()).
--
-- ── Why (14zcqntm62u) ────────────────────────────────────────────────────────
-- Super admins gather model training data: every verified box with its frame, in a form a YOLO
-- or COCO training run reads. A dataset is a frozen snapshot, so "which data trained which
-- model" always has an answer: a medtech can re-open a sample and change its rulings later, so a
-- snapshot stores the label values themselves, not just which samples it took. The images stay in
-- the private `samples` bucket and are read when the snapshot is downloaded.
--
-- ── Who ──────────────────────────────────────────────────────────────────────
-- Super admins only, for every function here. An org admin, a medtech and an anonymous client are
-- refused (42501). Both tables have row level security on and no policy, and no client role holds
-- a privilege on them: they are read and written only through these functions.
--
-- ── console_training_frames(from, to, organizations, model_versions) ─────────
-- The candidate frames for a filter, each with every detection on it, for the console to apply the
-- label rules to (`buildTrainingSet()` in src/domain/training-data.ts). A frame is a live sample
-- (C8: a sample deleted as a duplicate is counted in `deleted` and never returned) whose session
-- started in the period, Manila calendar days, the frame the dashboard counts in.
--
-- Nothing in the result names a patient, a medtech or a place. The patient is a stable key,
-- md5 of the patient id under a fixed namespace, used only to keep one patient's frames in one
-- split; the console never writes it out. The laboratory is its id, for the super admin's
-- preview, and an opaque code for the file. Security definer because a super admin's reads of
-- patients, sessions and samples return nothing since app 0013.
--
-- ── console_create_training_snapshot(name, filter, summary, items) ───────────
-- Freezes the frames the console built, in one transaction with its audit entry. Each item names a
-- live sample; the storage path and model version are copied from the sample row, not taken from
-- the caller, and a sample that is gone or deleted since the preview refuses the whole snapshot
-- (22023), so it can be built again. The patient key is replaced by a group code hashed with a
-- salt made for this snapshot and never stored: frames of one patient share a code inside one
-- snapshot, and the code links to nothing outside it (the privacy position's opaque study hash).
--
-- ── Reading and downloading ──────────────────────────────────────────────────
-- console_training_snapshots() lists them; console_training_snapshot(id) returns one with its
-- frames, storage paths included, for the server to fetch the images with; a browser never sees a
-- path. console_record_training_download(id) writes the download's audit entry, and the console
-- serves nothing if it fails.
--
-- ── Nothing is deleted (C8) ──────────────────────────────────────────────────
-- A snapshot is never changed or deleted: both tables refuse UPDATE, DELETE and TRUNCATE for every
-- role, the table owner included. The items reference no app table, so a snapshot never stops the
-- app writing or tombstoning a sample.
--
-- Additive only: two tables, their triggers, six functions. Nothing the app owns is altered.

begin;

-- ── training_snapshots ───────────────────────────────────────────────────────
create table public.training_snapshots (
    id               uuid primary key default gen_random_uuid(),
    name             text not null check (length(btrim(name)) between 2 and 120),
    -- Who made it. No foreign key, so a snapshot never stands in the way of a profile change.
    created_by       uuid,
    -- Their name or email at the time, as the audit log records it.
    created_by_label text,
    created_at       timestamptz not null default now(),
    -- What was asked for: period, laboratories, species, model versions, options, split.
    filter           jsonb not null default '{}'::jsonb,
    -- What came out: counts per split, class, model version and laboratory, and exclusions.
    summary          jsonb not null default '{}'::jsonb,
    frame_count      integer not null check (frame_count > 0),
    box_count        integer not null check (box_count >= 0)
);

create index training_snapshots_created_idx on public.training_snapshots (created_at desc);

-- ── training_snapshot_items ──────────────────────────────────────────────────
create table public.training_snapshot_items (
    snapshot_id        uuid not null references public.training_snapshots(id),
    -- The app's sample id. No foreign key: a snapshot must never constrain the app's own table.
    sample_id          uuid not null,
    split              text not null check (split in ('train', 'val', 'test')),
    -- Server only: `{user_id}/{sample_id}.jpg`. The file is named by sample id alone.
    storage_path       text not null,
    model_version      text not null,
    lab_code           text not null,
    patient_group      text not null,
    needs_reannotation boolean not null,
    -- [{class, x, y, w, h, verdict, modelClass, origin}], pixels on the 640×640 frame.
    labels             jsonb not null default '[]'::jsonb,
    -- [{modelClass, x, y, w, h}]: boxes the medtech rejected, at the model's position.
    hard_negatives     jsonb not null default '[]'::jsonb,
    primary key (snapshot_id, sample_id)
);

create or replace function public.console_training_is_frozen()
returns trigger
language plpgsql
as $$
begin
    raise exception '% is frozen: a snapshot is never changed or deleted', tg_table_name;
end;
$$;

create trigger training_snapshots_frozen
before update or delete on public.training_snapshots
for each row execute function public.console_training_is_frozen();
create trigger training_snapshots_no_truncate
before truncate on public.training_snapshots
for each statement execute function public.console_training_is_frozen();

create trigger training_snapshot_items_frozen
before update or delete on public.training_snapshot_items
for each row execute function public.console_training_is_frozen();
create trigger training_snapshot_items_no_truncate
before truncate on public.training_snapshot_items
for each statement execute function public.console_training_is_frozen();

alter table public.training_snapshots      enable row level security;
alter table public.training_snapshot_items enable row level security;
revoke all on public.training_snapshots, public.training_snapshot_items from public, anon, authenticated;


-- ── The super admin check every function starts with ─────────────────────────
create or replace function public.console_require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    if not coalesce(public.is_admin(auth.uid()), false) then
        raise exception 'Only a super admin can use training data' using errcode = '42501';
    end if;
end;
$$;


-- ── Candidate frames ─────────────────────────────────────────────────────────
create or replace function public.console_training_frames(
    p_from           date default null,
    p_to             date default null,
    p_organizations  uuid[] default null,
    p_model_versions text[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_result jsonb;
begin
    perform public.console_require_super_admin();

    with frame as (
        select sa.id,
               sa.deleted_at,
               sa.inference_model_version,
               sa.needs_reannotation,
               sa.is_manual,
               se.patient_id,
               po.organization_id
        from public.samples sa
        join public.sessions se on se.id = sa.session_id
        left join public.patient_organizations po on po.patient_id = se.patient_id
        where (p_from is null or se.started_at >= p_from::timestamp at time zone 'Asia/Manila')
          and (p_to is null or se.started_at < (p_to + 1)::timestamp at time zone 'Asia/Manila')
          and (p_organizations is null or po.organization_id = any (p_organizations))
          and (p_model_versions is null or sa.inference_model_version = any (p_model_versions))
    ),
    live as (
        select * from frame where deleted_at is null
    ),
    detection as (
        select d.sample_id,
               jsonb_agg(jsonb_build_object(
                   'verdict',      d.verdict,
                   'class_label',  d.class_label,
                   'expert_class', d.expert_class,
                   'linked',       d.prediction_id is not null,
                   'box', case
                       when d.bbox_x is not null and d.bbox_y is not null
                        and d.bbox_w is not null and d.bbox_h is not null
                       then jsonb_build_array(d.bbox_x, d.bbox_y, d.bbox_w, d.bbox_h)
                   end,
                   'model_box', case
                       when p.id is not null
                       then jsonb_build_array(p.bbox_x, p.bbox_y, p.bbox_w, p.bbox_h)
                   end)
                   order by d.id) as detections
        from public.detections d
        join live l on l.id = d.sample_id
        left join public.predictions p on p.id = d.prediction_id and p.sample_id = d.sample_id
        group by d.sample_id
    ),
    predicted as (
        select distinct p.sample_id from public.predictions p join live l on l.id = p.sample_id
    )
    select jsonb_build_object(
        'deleted', (select count(*) from frame where deleted_at is not null),
        'frames', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'sample_id',          l.id,
                       'patient_key',        md5('agarthavision-split-v1:' || l.patient_id::text),
                       'organization_id',    l.organization_id,
                       'lab_code',           case
                           when l.organization_id is null then 'LAB-NONE'
                           else 'LAB-' || upper(left(md5('agarthavision-lab-v1:' || l.organization_id::text), 6))
                       end,
                       'model_version',      l.inference_model_version,
                       'needs_reannotation', l.needs_reannotation,
                       'is_manual',          l.is_manual,
                       'has_predictions',    pr.sample_id is not null,
                       'detections',         coalesce(dt.detections, '[]'::jsonb))
                   order by l.id)
            from live l
            left join detection dt on dt.sample_id = l.id
            left join predicted pr on pr.sample_id = l.id), '[]'::jsonb)
    )
    into v_result;

    return v_result;
end;
$$;

-- The model versions live frames were read with, for the filter, most frames first.
create or replace function public.console_training_model_versions()
returns table (model_version text, frames integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    perform public.console_require_super_admin();
    return query
        select sa.inference_model_version, count(*)::integer
        from public.samples sa
        where sa.deleted_at is null
        group by sa.inference_model_version
        order by count(*) desc, sa.inference_model_version;
end;
$$;


-- ── Freeze a snapshot ────────────────────────────────────────────────────────
create or replace function public.console_create_training_snapshot(
    p_name    text,
    p_filter  jsonb,
    p_summary jsonb,
    p_items   jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_name   text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
    v_count  integer := coalesce(jsonb_array_length(p_items), 0);
    v_salt   text := gen_random_uuid()::text;
    v_id     uuid;
    v_label  text;
    v_frames integer;
    v_boxes  integer;
begin
    perform public.console_require_super_admin();

    if length(v_name) not between 2 and 120 then
        raise exception 'A snapshot name has 2 to 120 characters' using errcode = '22023';
    end if;
    if v_count = 0 or v_count > 20000 then
        raise exception 'A snapshot holds 1 to 20000 frames, not %', v_count using errcode = '22023';
    end if;

    -- Rows are frozen once written, so the box count is taken from the input, before them.
    select coalesce(sum(jsonb_array_length(coalesce(i.value -> 'labels', '[]'::jsonb))), 0)::integer
    into v_boxes
    from jsonb_array_elements(p_items) i;

    select coalesce(nullif(btrim(p.full_name), ''), u.email) into v_label
    from public.profiles p left join auth.users u on u.id = p.id
    where p.id = auth.uid();

    insert into public.training_snapshots
        (name, created_by, created_by_label, filter, summary, frame_count, box_count)
    values (v_name, auth.uid(), v_label, coalesce(p_filter, '{}'::jsonb),
            coalesce(p_summary, '{}'::jsonb), v_count, v_boxes)
    returning id into v_id;

    insert into public.training_snapshot_items
        (snapshot_id, sample_id, split, storage_path, model_version, lab_code, patient_group,
         needs_reannotation, labels, hard_negatives)
    select v_id,
           sa.id,
           i.split,
           sa.storage_path,
           sa.inference_model_version,
           i.lab_code,
           left(md5(v_salt || ':' || i.patient_key), 12),
           sa.needs_reannotation,
           coalesce(i.labels, '[]'::jsonb),
           coalesce(i.hard_negatives, '[]'::jsonb)
    from jsonb_to_recordset(p_items) as i(
             sample_id uuid, split text, lab_code text, patient_key text,
             labels jsonb, hard_negatives jsonb)
    join public.samples sa on sa.id = i.sample_id and sa.deleted_at is null;

    get diagnostics v_frames = row_count;
    if v_frames <> v_count then
        raise exception 'A frame in this snapshot is no longer live; preview it again'
            using errcode = '22023', hint = 'stale';
    end if;

    perform public.console_write_audit(
        'training.snapshot.create', 'training_snapshot', v_id::text, null,
        jsonb_build_object('name', v_name, 'frames', v_frames, 'boxes', v_boxes,
                           'filter', coalesce(p_filter, '{}'::jsonb)));
    return v_id;
end;
$$;


-- ── Read ─────────────────────────────────────────────────────────────────────
create or replace function public.console_training_snapshots()
returns table (
    id               uuid,
    name             text,
    created_by_label text,
    created_at       timestamptz,
    frame_count      integer,
    box_count        integer,
    summary          jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
    perform public.console_require_super_admin();
    return query
        select s.id, s.name, s.created_by_label, s.created_at, s.frame_count, s.box_count,
               s.summary
        from public.training_snapshots s
        order by s.created_at desc, s.id;
end;
$$;

create or replace function public.console_training_snapshot(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
    v_result jsonb;
begin
    perform public.console_require_super_admin();

    select jsonb_build_object(
        'id',               s.id,
        'name',             s.name,
        'created_by_label', s.created_by_label,
        'created_at',       s.created_at,
        'frame_count',      s.frame_count,
        'box_count',        s.box_count,
        'filter',           s.filter,
        'summary',          s.summary,
        'items', coalesce((
            select jsonb_agg(jsonb_build_object(
                       'sample_id',          i.sample_id,
                       'split',              i.split,
                       'storage_path',       i.storage_path,
                       'model_version',      i.model_version,
                       'lab_code',           i.lab_code,
                       'patient_group',      i.patient_group,
                       'needs_reannotation', i.needs_reannotation,
                       'labels',             i.labels,
                       'hard_negatives',     i.hard_negatives)
                   order by i.split, i.sample_id)
            from public.training_snapshot_items i where i.snapshot_id = s.id), '[]'::jsonb))
    into v_result
    from public.training_snapshots s
    where s.id = p_id;

    if v_result is null then
        raise exception 'No such training snapshot' using errcode = 'P0002';
    end if;
    return v_result;
end;
$$;

-- Written before the file is served. If this fails, nothing is served.
create or replace function public.console_record_training_download(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_snapshot public.training_snapshots;
begin
    perform public.console_require_super_admin();

    select * into v_snapshot from public.training_snapshots where id = p_id;
    if not found then
        raise exception 'No such training snapshot' using errcode = 'P0002';
    end if;

    perform public.console_write_audit(
        'training.snapshot.download', 'training_snapshot', p_id::text, null,
        jsonb_build_object('name', v_snapshot.name, 'frames', v_snapshot.frame_count));
end;
$$;

revoke execute on function public.console_training_is_frozen() from public, anon, authenticated;
revoke execute on function public.console_require_super_admin() from public, anon;
revoke execute on function public.console_training_frames(date, date, uuid[], text[]) from public, anon;
revoke execute on function public.console_training_model_versions() from public, anon;
revoke execute on function public.console_create_training_snapshot(text, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.console_training_snapshots() from public, anon;
revoke execute on function public.console_training_snapshot(uuid) from public, anon;
revoke execute on function public.console_record_training_download(uuid) from public, anon;
grant execute on function public.console_require_super_admin() to authenticated;
grant execute on function public.console_training_frames(date, date, uuid[], text[]) to authenticated;
grant execute on function public.console_training_model_versions() to authenticated;
grant execute on function public.console_create_training_snapshot(text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.console_training_snapshots() to authenticated;
grant execute on function public.console_training_snapshot(uuid) to authenticated;
grant execute on function public.console_record_training_download(uuid) to authenticated;

commit;
