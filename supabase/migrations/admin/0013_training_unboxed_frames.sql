-- admin/0013 · Training snapshots may keep frames with eggs counted but never boxed
--
-- Run via: Supabase dashboard → SQL Editor → paste → Run. By hand, once.
-- Requires: admin/0012_training_snapshots.sql.
--
-- ── Why (14zcqntm62u) ────────────────────────────────────────────────────────
-- A frame where a medtech counted an egg without boxing it is left out of a snapshot whole: kept,
-- the unboxed egg would be taught as background. A super admin may now ask for those frames anyway
-- ("Include frames with unboxed eggs", off by default). Each one goes in with the boxes it has and
-- must say how many eggs it is missing, so whoever trains on it can leave it out or use it only
-- where a missing box does no harm. That count is frozen with the frame, like its labels.
--
-- ── What changes ─────────────────────────────────────────────────────────────
--   * training_snapshot_items.unboxed_eggs: eggs counted on the frame but never boxed. 0 for
--     every frame of an earlier snapshot, which never kept such a frame.
--   * console_create_training_snapshot() stores it; console_training_snapshot() returns it.
--   * console_training_schema_version() returns 13, so the console knows it may offer the option.
--     Until this is applied the console does not offer it, and creates snapshots as before.
--
-- Additive only: a column on this repo's own table (no row is changed: the frozen-row triggers do
-- not fire for a new column with a default), two functions replaced with the same signature and
-- privileges, one new function. Nothing the app owns is altered.

begin;

alter table public.training_snapshot_items
    add column unboxed_eggs integer not null default 0 check (unboxed_eggs >= 0);

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
         needs_reannotation, labels, hard_negatives, unboxed_eggs)
    select v_id,
           sa.id,
           i.split,
           sa.storage_path,
           sa.inference_model_version,
           i.lab_code,
           left(md5(v_salt || ':' || i.patient_key), 12),
           sa.needs_reannotation,
           coalesce(i.labels, '[]'::jsonb),
           coalesce(i.hard_negatives, '[]'::jsonb),
           coalesce(i.unboxed_eggs, 0)
    from jsonb_to_recordset(p_items) as i(
             sample_id uuid, split text, lab_code text, patient_key text,
             labels jsonb, hard_negatives jsonb, unboxed_eggs integer)
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
                       'hard_negatives',     i.hard_negatives,
                       'unboxed_eggs',       i.unboxed_eggs)
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

-- The training schema this database has, for the console to offer only what it can store.
create or replace function public.console_training_schema_version()
returns integer
language sql
immutable
set search_path = public
as $$ select 13 $$;

revoke execute on function public.console_training_schema_version() from public, anon;
grant execute on function public.console_training_schema_version() to authenticated;

commit;
