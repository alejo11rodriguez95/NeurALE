-- Dashboard Neuronal · Diálogo Táctico CD Nneo
-- Chat de módulo: Dashboard Neuronal (ver ARCHITECTURE.md)
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run,
-- en el proyecto único de NeurALE. Es idempotente (se puede volver a correr).
--
-- Quién escribe qué (RLS real por rol desde el inicio — ya existe login):
--   dashboard_tactical_process    → fila de su proceso: jefe_area del módulo
--                                   (rec=inbound, alm=storage, pic=picking,
--                                   des=outbound) + gerencia/admin
--   dashboard_tactical_fill_rate  → jefe_area de picking + gerencia/admin
--   dashboard_tactical_safety     → incidentes / casi accidentes / actos
--                                   inseguros del turno: cualquier jefe_area
--                                   + gerencia/admin
--   dashboard_tactical_shift      → jefe de turno, compromisos, housekeeping,
--                                   5S, pre-operacional: gerencia/admin
--   dashboard_tactical_settings   → metas y días sin accidentes (LTI):
--                                   gerencia/admin
-- Lectura de todas: gerencia, admin y jefe_area. Operadores no ven nada.
--
-- Todas las tablas son "por fecha + turno". Si no existe fila para un turno,
-- el frontend muestra los contadores de seguridad en 0 (así cada turno arranca
-- en cero sin necesidad de ningún proceso programado).

-- =========================================================================
-- 0. Helpers
-- =========================================================================

-- ¿El usuario actual es gerencia o admin?
create or replace function dashboard_is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admin_current_access() c
    where c.access_level in ('admin', 'gerencia')
  )
$$;

-- ¿Puede leer el Diálogo Táctico? (gerencia, admin, jefe_area)
create or replace function dashboard_can_read_tactical()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admin_current_access() c
    where c.access_level in ('admin', 'gerencia', 'jefe_area')
  )
$$;

-- ¿Es jefe_area del módulo indicado? (null = de cualquier módulo)
create or replace function dashboard_is_area_lead(p_module text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admin_current_access() c
    where c.access_level = 'jefe_area'
      and (p_module is null or c.module = p_module)
  )
$$;

-- Proceso del diálogo → módulo que lo llena
create or replace function dashboard_process_module(p_process text)
returns text
language sql
immutable
as $$
  select case p_process
    when 'rec' then 'inbound'
    when 'alm' then 'storage'
    when 'pic' then 'picking'
    when 'des' then 'outbound'
  end
$$;

-- Sella updated_at / updated_by en cada escritura
create or replace function dashboard_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- =========================================================================
-- 1. Fila de cada proceso (la llena cada módulo)
-- =========================================================================

create table if not exists dashboard_tactical_process (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),

  shift_date date not null,
  shift text not null check (shift in ('A', 'B')),
  process_id text not null check (process_id in ('rec', 'alm', 'pic', 'des')),

  vol_plan numeric,
  vol_real numeric,
  hh_direct numeric,          -- horas-hombre trabajadas
  staff_plan numeric,         -- dotación plan
  staff_present numeric,      -- presentes
  equip_plan numeric,         -- montacargas plan (camiones en Despacho)
  equip_available numeric,    -- montacargas operativos (camiones disponibles)
  errors numeric,

  unique (shift_date, shift, process_id)
);

-- =========================================================================
-- 2. Fill Rate + causa del faltante (lo llena Picking)
-- =========================================================================

create table if not exists dashboard_tactical_fill_rate (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),

  shift_date date not null,
  shift text not null check (shift in ('A', 'B')),

  lines_requested numeric,
  lines_dispatched numeric,
  shortage_cause text,

  unique (shift_date, shift)
);

-- =========================================================================
-- 3. Seguridad del turno (cualquier jefe o gerencia)
-- =========================================================================

create table if not exists dashboard_tactical_safety (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),

  shift_date date not null,
  shift text not null check (shift in ('A', 'B')),

  incidents integer not null default 0 check (incidents >= 0),
  near_misses integer not null default 0 check (near_misses >= 0),
  unsafe_acts integer not null default 0 check (unsafe_acts >= 0),

  unique (shift_date, shift)
);

-- =========================================================================
-- 4. Datos del turno que llena el gerente
-- =========================================================================

create table if not exists dashboard_tactical_shift (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),

  shift_date date not null,
  shift text not null check (shift in ('A', 'B')),

  shift_lead text,
  -- [{ "problem": "...", "owner": "...", "due": "..." }, ...] (3 filas)
  commitments jsonb not null default '[]'::jsonb,
  -- { "r": { "g1": "c" | "p" | "n" | "x", ... }, "obs": "..." }
  housekeeping jsonb not null default '{"r":{},"obs":""}'::jsonb,
  audit_5s numeric,
  preop_done numeric,
  preop_in_use numeric,

  unique (shift_date, shift)
);

-- =========================================================================
-- 5. Configuración: metas + días sin accidentes con tiempo perdido (LTI)
-- =========================================================================

create table if not exists dashboard_tactical_settings (
  id integer primary key default 1 check (id = 1),   -- una sola fila
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),

  -- { "procesos": [{ "id","unidad","metaProd","metaErr","dot","mc" }], "g": { "frSuc","s5","preop" } }
  goals jsonb not null default '{}'::jsonb,
  -- Días sin LTI = hoy (hora El Salvador) − lti_since. Se acumula solo cada
  -- día; el gerente lo corrige/reinicia moviendo esta fecha.
  lti_since date,
  lti_record integer
);

insert into dashboard_tactical_settings (id, goals)
values (1, '{
  "procesos": [
    {"id":"rec","unidad":"pallets","metaProd":6,"metaErr":0,"dot":8,"mc":3},
    {"id":"alm","unidad":"ubicaciones","metaProd":10,"metaErr":0,"dot":6,"mc":4},
    {"id":"pic","unidad":"líneas","metaProd":45,"metaErr":2,"dot":18,"mc":3},
    {"id":"des","unidad":"pallets","metaProd":8,"metaErr":0,"dot":10,"mc":3}
  ],
  "g": {"frSuc":90,"s5":90,"preop":100}
}'::jsonb)
on conflict (id) do nothing;

-- =========================================================================
-- 6. Triggers updated_at / updated_by
-- =========================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'dashboard_tactical_process',
    'dashboard_tactical_fill_rate',
    'dashboard_tactical_safety',
    'dashboard_tactical_shift',
    'dashboard_tactical_settings'
  ] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before insert or update on %I for each row execute function dashboard_touch()',
      t, t
    );
  end loop;
end $$;

-- =========================================================================
-- 7. RLS (real, por rol)
-- =========================================================================

alter table dashboard_tactical_process   enable row level security;
alter table dashboard_tactical_fill_rate enable row level security;
alter table dashboard_tactical_safety    enable row level security;
alter table dashboard_tactical_shift     enable row level security;
alter table dashboard_tactical_settings  enable row level security;

-- Lectura (las 5 tablas)
drop policy if exists "dtp_select" on dashboard_tactical_process;
create policy "dtp_select" on dashboard_tactical_process
  for select using (dashboard_can_read_tactical());

drop policy if exists "dtf_select" on dashboard_tactical_fill_rate;
create policy "dtf_select" on dashboard_tactical_fill_rate
  for select using (dashboard_can_read_tactical());

drop policy if exists "dts_select" on dashboard_tactical_safety;
create policy "dts_select" on dashboard_tactical_safety
  for select using (dashboard_can_read_tactical());

drop policy if exists "dtsh_select" on dashboard_tactical_shift;
create policy "dtsh_select" on dashboard_tactical_shift
  for select using (dashboard_can_read_tactical());

drop policy if exists "dtcfg_select" on dashboard_tactical_settings;
create policy "dtcfg_select" on dashboard_tactical_settings
  for select using (dashboard_can_read_tactical());

-- Procesos: gerencia/admin o jefe_area del módulo dueño de ese proceso
drop policy if exists "dtp_insert" on dashboard_tactical_process;
create policy "dtp_insert" on dashboard_tactical_process
  for insert with check (
    dashboard_is_manager() or dashboard_is_area_lead(dashboard_process_module(process_id))
  );

drop policy if exists "dtp_update" on dashboard_tactical_process;
create policy "dtp_update" on dashboard_tactical_process
  for update
  using (dashboard_is_manager() or dashboard_is_area_lead(dashboard_process_module(process_id)))
  with check (dashboard_is_manager() or dashboard_is_area_lead(dashboard_process_module(process_id)));

-- Fill rate: gerencia/admin o jefe_area de picking
drop policy if exists "dtf_insert" on dashboard_tactical_fill_rate;
create policy "dtf_insert" on dashboard_tactical_fill_rate
  for insert with check (dashboard_is_manager() or dashboard_is_area_lead('picking'));

drop policy if exists "dtf_update" on dashboard_tactical_fill_rate;
create policy "dtf_update" on dashboard_tactical_fill_rate
  for update
  using (dashboard_is_manager() or dashboard_is_area_lead('picking'))
  with check (dashboard_is_manager() or dashboard_is_area_lead('picking'));

-- Seguridad del turno: gerencia/admin o cualquier jefe_area
drop policy if exists "dts_insert" on dashboard_tactical_safety;
create policy "dts_insert" on dashboard_tactical_safety
  for insert with check (dashboard_is_manager() or dashboard_is_area_lead(null));

drop policy if exists "dts_update" on dashboard_tactical_safety;
create policy "dts_update" on dashboard_tactical_safety
  for update
  using (dashboard_is_manager() or dashboard_is_area_lead(null))
  with check (dashboard_is_manager() or dashboard_is_area_lead(null));

-- Datos del gerente: solo gerencia/admin
drop policy if exists "dtsh_insert" on dashboard_tactical_shift;
create policy "dtsh_insert" on dashboard_tactical_shift
  for insert with check (dashboard_is_manager());

drop policy if exists "dtsh_update" on dashboard_tactical_shift;
create policy "dtsh_update" on dashboard_tactical_shift
  for update using (dashboard_is_manager()) with check (dashboard_is_manager());

-- Metas y días sin LTI: solo gerencia/admin (la fila única ya existe)
drop policy if exists "dtcfg_update" on dashboard_tactical_settings;
create policy "dtcfg_update" on dashboard_tactical_settings
  for update using (dashboard_is_manager()) with check (dashboard_is_manager());

-- Sin políticas de delete: nadie borra registros del diálogo desde la app.

-- =========================================================================
-- 8. Realtime (el tablero se actualiza solo cuando un jefe guarda)
-- =========================================================================
-- Realtime respeta RLS: solo reciben cambios quienes pueden leer la tabla.

do $$
declare t text;
begin
  foreach t in array array[
    'dashboard_tactical_process',
    'dashboard_tactical_fill_rate',
    'dashboard_tactical_safety',
    'dashboard_tactical_shift',
    'dashboard_tactical_settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
