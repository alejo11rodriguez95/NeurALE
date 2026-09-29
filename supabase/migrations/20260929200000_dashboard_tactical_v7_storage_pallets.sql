-- Dashboard Neuronal · Diálogo Táctico v7 + Storage "Registro x Pallet" /
-- "Control de Referencias"
-- Chat: Dashboard Neuronal (ver ARCHITECTURE.md → "Diálogo Táctico CD Nneo" → v7)
--
-- REQUIERE (ya corridas): 20260926120000_dashboard_tactical_dialogue.sql,
-- 20260927120000_dashboard_tactical_quality.sql y 20260927180000_storage_isq.sql
-- (reutiliza sus helpers storage_isq_is_manager / storage_isq_in_module /
-- storage_isq_can_configure, que a su vez usan admin_current_access()).
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Es idempotente (se puede volver a correr).
--
-- Qué hace:
--   1. dashboard_tactical_process.staff_breakdown  dotación de Inbound por puesto
--   2. dashboard_tactical_fill_rate_daily          fill rate por DÍA (el tablero muestra el del día anterior)
--   3. storage_references                          Control de Referencias (EN PROCESO → ALMACENADO → ACTUALIZADO)
--   4. storage_pallet_records                      Registro x Pallet (alimenta los pallets reales de Storage)
--   5. storage_references_summary                  vista: totales por referencia
--   6. Realtime + ajuste de metas (unidad de Storage = pallets)
--
-- Permisos (mismo criterio que el ISQ de Storage):
--   registrar pallets        admin, gerencia, cualquier usuario de Storage
--   corregir/borrar registro admin, gerencia, jefe de Storage (o nivel con "editar" en Storage)
--   marcar ALMACENADO/reabrir admin, gerencia, jefe de Storage (o nivel con "editar" en Storage)
--   marcar ACTUALIZADO/deshacer admin, gerencia, cualquier usuario de Inbound
--   leer                     admin, gerencia, usuarios de Storage o Inbound, lectores del Diálogo Táctico

-- =========================================================================
-- 1. Dotación de Inbound por puesto
-- =========================================================================
-- { "rev": { "plan": n, "present": n }, "aux": { "plan": n, "present": n } }
-- staff_plan / staff_present siguen guardando la SUMA (lo que ve el tablero).
alter table dashboard_tactical_process add column if not exists staff_breakdown jsonb;

-- =========================================================================
-- 2. Fill rate por día
-- =========================================================================
create table if not exists dashboard_tactical_fill_rate_daily (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),

  fr_date date not null unique,        -- día al que corresponde el resultado
  lines_requested numeric,
  lines_dispatched numeric,
  shortage_cause text
);

drop trigger if exists dashboard_tactical_fill_rate_daily_touch on dashboard_tactical_fill_rate_daily;
create trigger dashboard_tactical_fill_rate_daily_touch
  before insert or update on dashboard_tactical_fill_rate_daily
  for each row execute function dashboard_touch();

alter table dashboard_tactical_fill_rate_daily enable row level security;

drop policy if exists "dtfd_select" on dashboard_tactical_fill_rate_daily;
create policy "dtfd_select" on dashboard_tactical_fill_rate_daily
  for select using (dashboard_can_read_tactical());

drop policy if exists "dtfd_insert" on dashboard_tactical_fill_rate_daily;
create policy "dtfd_insert" on dashboard_tactical_fill_rate_daily
  for insert with check (dashboard_is_manager() or dashboard_is_area_lead('picking'));

drop policy if exists "dtfd_update" on dashboard_tactical_fill_rate_daily;
create policy "dtfd_update" on dashboard_tactical_fill_rate_daily
  for update
  using (dashboard_is_manager() or dashboard_is_area_lead('picking'))
  with check (dashboard_is_manager() or dashboard_is_area_lead('picking'));

-- =========================================================================
-- 3. Control de Referencias
-- =========================================================================
create or replace function storage_pallets_can_read()
returns boolean language sql security definer set search_path = public stable as $$
  select storage_isq_is_manager()
      or storage_isq_in_module('storage')
      or storage_isq_in_module('inbound')
      or dashboard_can_read_tactical()
$$;

create table if not exists storage_references (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  reference text not null,
  reference_key text generated always as (upper(btrim(reference))) stored,
  status text not null default 'en_proceso'
    check (status in ('en_proceso', 'almacenado', 'actualizado')),
  stored_at timestamptz,          -- cuándo Storage la marcó ALMACENADO
  stored_by uuid references auth.users(id),
  system_updated_at timestamptz,  -- cuándo Inbound la marcó ACTUALIZADO
  system_updated_by uuid references auth.users(id)
);

create unique index if not exists storage_references_key_uidx on storage_references (reference_key);
create index if not exists storage_references_status_idx on storage_references (status);

-- Transiciones permitidas y quién puede hacerlas. Gerencia/admin: cualquiera.
create or replace function storage_references_before_update()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.reference := old.reference;
  new.created_at := old.created_at;
  new.created_by := old.created_by;

  if new.status is distinct from old.status and not storage_isq_is_manager() then
    if (old.status, new.status) in (('en_proceso', 'almacenado'), ('almacenado', 'en_proceso')) then
      if not storage_isq_can_configure() then
        raise exception 'Solo el jefe de Storage (o un nivel con "editar" en Storage), gerencia o admin pueden marcar ALMACENADO o reabrir una referencia.';
      end if;
    elsif (old.status, new.status) in (('almacenado', 'actualizado'), ('actualizado', 'almacenado')) then
      if not storage_isq_in_module('inbound') then
        raise exception 'Solo Inbound, gerencia o admin pueden marcar ACTUALIZADO una referencia.';
      end if;
    else
      raise exception 'Cambio de estado no permitido: % → %.', old.status, new.status;
    end if;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'almacenado' and old.status = 'en_proceso' then
      new.stored_at := now();
      new.stored_by := auth.uid();
    elsif new.status = 'en_proceso' then
      new.stored_at := null;
      new.stored_by := null;
      new.system_updated_at := null;
      new.system_updated_by := null;
    elsif new.status = 'actualizado' then
      new.system_updated_at := now();
      new.system_updated_by := auth.uid();
    elsif new.status = 'almacenado' and old.status = 'actualizado' then
      new.system_updated_at := null;
      new.system_updated_by := null;
    end if;
  else
    new.stored_at := old.stored_at;
    new.stored_by := old.stored_by;
    new.system_updated_at := old.system_updated_at;
    new.system_updated_by := old.system_updated_by;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists storage_references_before_update on storage_references;
create trigger storage_references_before_update before update on storage_references
  for each row execute function storage_references_before_update();

alter table storage_references enable row level security;

drop policy if exists "sref_select" on storage_references;
create policy "sref_select" on storage_references for select using (storage_pallets_can_read());

-- Sin política de insert: las crea el sistema al registrar el primer pallet
-- de una referencia (trigger security definer). Sin delete.
drop policy if exists "sref_update" on storage_references;
create policy "sref_update" on storage_references
  for update
  using (storage_isq_can_configure() or storage_isq_in_module('inbound'))
  with check (storage_isq_can_configure() or storage_isq_in_module('inbound'));

-- =========================================================================
-- 4. Registro x Pallet
-- =========================================================================
create table if not exists storage_pallet_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  recorded_at timestamptz not null default now(),
  record_date date not null default ((now() at time zone 'America/El_Salvador')::date),
  stower_employee_id uuid references admin_employees(id) on delete set null,
  stower_name text not null,                   -- copia del nombre (historial estable)
  reference text not null,
  reference_key text generated always as (upper(btrim(reference))) stored,
  pallets integer not null check (pallets > 0),
  sku_count integer not null default 0 check (sku_count >= 0)
);

create index if not exists storage_pallet_records_date_idx on storage_pallet_records (record_date desc);
create index if not exists storage_pallet_records_ref_idx on storage_pallet_records (reference_key);

-- Fecha, hora y autor los pone el servidor. No se aceptan pallets nuevos en
-- una referencia que ya no está EN PROCESO (Storage debe reabrirla primero).
create or replace function storage_pallet_records_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  new.recorded_at := now();
  new.record_date := (now() at time zone 'America/El_Salvador')::date;
  new.created_at := now();
  new.created_by := auth.uid();
  new.updated_at := now();
  new.reference := btrim(new.reference);
  if new.reference = '' then
    raise exception 'La referencia es obligatoria.';
  end if;

  select status into st from storage_references where reference_key = upper(btrim(new.reference));
  if st is not null and st <> 'en_proceso' then
    raise exception 'La referencia % ya está %. Si falta almacenar pallets, pide al jefe de Storage que la reabra.',
      new.reference, upper(st);
  end if;
  if st is null then
    insert into storage_references (reference, created_by) values (new.reference, auth.uid())
    on conflict (reference_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists storage_pallet_records_before_insert on storage_pallet_records;
create trigger storage_pallet_records_before_insert before insert on storage_pallet_records
  for each row execute function storage_pallet_records_before_insert();

create or replace function storage_pallet_records_before_update()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.recorded_at := old.recorded_at;
  new.record_date := old.record_date;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists storage_pallet_records_before_update on storage_pallet_records;
create trigger storage_pallet_records_before_update before update on storage_pallet_records
  for each row execute function storage_pallet_records_before_update();

alter table storage_pallet_records enable row level security;

drop policy if exists "spr_select" on storage_pallet_records;
create policy "spr_select" on storage_pallet_records for select using (storage_pallets_can_read());

drop policy if exists "spr_insert" on storage_pallet_records;
create policy "spr_insert" on storage_pallet_records
  for insert with check (storage_isq_is_manager() or storage_isq_in_module('storage'));

drop policy if exists "spr_update" on storage_pallet_records;
create policy "spr_update" on storage_pallet_records
  for update using (storage_isq_can_configure()) with check (storage_isq_can_configure());

drop policy if exists "spr_delete" on storage_pallet_records;
create policy "spr_delete" on storage_pallet_records for delete using (storage_isq_can_configure());

-- =========================================================================
-- 5. Totales por referencia (la vista respeta la RLS de quien consulta)
-- =========================================================================
create or replace view storage_references_summary
with (security_invoker = true) as
select
  r.id,
  r.reference,
  r.reference_key,
  r.status,
  r.created_at,
  r.stored_at,
  r.system_updated_at,
  coalesce(sum(p.pallets), 0)::int   as pallets,
  coalesce(sum(p.sku_count), 0)::int as sku_count,
  count(p.id)::int                   as records,
  min(p.recorded_at)                 as first_recorded_at,
  max(p.recorded_at)                 as last_recorded_at
from storage_references r
left join storage_pallet_records p on p.reference_key = r.reference_key
group by r.id;

-- =========================================================================
-- 6. Realtime + metas
-- =========================================================================
do $$
declare t text;
begin
  foreach t in array array['dashboard_tactical_fill_rate_daily', 'storage_references', 'storage_pallet_records'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- Storage pasa a medirse en pallets (antes "ubicaciones"). No pisa otras metas.
update dashboard_tactical_settings
set goals = jsonb_set(
  goals,
  '{procesos}',
  coalesce(
    (
      select jsonb_agg(
        case when p->>'id' = 'alm' and coalesce(p->>'unidad', '') in ('', 'ubicaciones')
             then p || '{"unidad":"pallets"}'::jsonb else p end
      )
      from jsonb_array_elements(goals->'procesos') p
    ),
    '[]'::jsonb
  )
)
where id = 1 and goals ? 'procesos';
