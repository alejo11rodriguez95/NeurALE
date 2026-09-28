-- Storage · Inbound-Storage Quality (ISQ)
-- Chat de módulo: Storage (ver ARCHITECTURE.md → "Estado de módulos").
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Requiere que ya estén corridas las migraciones de Configuraciones y
-- Administradores (`admin_current_access()`, `admin_employees`). Es
-- idempotente: se puede volver a correr sin duplicar nada.
--
-- Qué crea:
--   storage_isq_types      catálogo de tipos de incidencia (editable en Storage → Ajustes → ISQ)
--   storage_isq_fields     campos extra del formulario (editable en Storage → Ajustes → ISQ)
--   storage_isq_settings   fila única: puestos que alimentan el select "Almacenador"
--   storage_isq_incidents  incidencias que Storage reporta a Inbound + seguimiento de Inbound
--
-- RLS REAL por rol desde el inicio (no la permisiva temporal): el login ya
-- está en producción y la URL es pública. Reglas:
--   leer incidencias      admin, gerencia, cualquier usuario de Storage o de Inbound
--   reportar (insert)     admin, gerencia, cualquier usuario de Storage
--   seguimiento (update)  admin, gerencia, cualquier usuario de Inbound, jefe_area de Storage
--   borrar incidencia     admin, gerencia, jefe_area de Storage
--   leer catálogos        cualquier usuario activo
--   editar catálogos      admin, gerencia, jefe_area de Storage

-- =========================================================================
-- 0. Helpers de acceso (reutilizan admin_current_access())
-- =========================================================================

create or replace function storage_isq_is_manager()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia'))
$$;

create or replace function storage_isq_in_module(p_module text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_current_access() c where c.module = p_module)
$$;

create or replace function storage_isq_can_configure()
returns boolean language sql security definer set search_path = public stable as $$
  select storage_isq_is_manager() or exists (
    select 1 from admin_current_access() c where c.access_level = 'jefe_area' and c.module = 'storage'
  )
$$;

create or replace function storage_isq_is_user()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_current_access())
$$;

-- =========================================================================
-- 1. Catálogo de tipos de incidencia
-- =========================================================================

create table if not exists storage_isq_types (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

create unique index if not exists storage_isq_types_label_uidx on storage_isq_types (lower(label));

insert into storage_isq_types (label, sort_order)
select v.label, v.ord
from (values
  ('Pallet mal estibado', 10),
  ('Pallet dañado', 20),
  ('Producto fuera de pallet', 30),
  ('Pallet incompleto', 40),
  ('SKU incorrecto', 50),
  ('Etiqueta incorrecta o ilegible', 60),
  ('Producto averiado', 70),
  ('Exceso de altura', 80),
  ('Carga inestable', 90),
  ('Diferencia física vs. sistema', 100),
  ('Incidencia de embalaje', 110)
) as v(label, ord)
where not exists (select 1 from storage_isq_types t where lower(t.label) = lower(v.label));

-- =========================================================================
-- 2. Campos extra del formulario
-- =========================================================================

create table if not exists storage_isq_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  field_type text not null default 'text' check (field_type in ('text', 'number', 'date', 'select')),
  options text[] not null default '{}',
  required boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);

-- =========================================================================
-- 3. Ajustes generales de ISQ (fila única)
-- =========================================================================

create table if not exists storage_isq_settings (
  id int primary key default 1 check (id = 1),
  reporter_positions text[] not null default array['Almacenador'],
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into storage_isq_settings (id) values (1) on conflict (id) do nothing;

-- =========================================================================
-- 4. Incidencias
-- =========================================================================

create table if not exists storage_isq_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  -- Reporte (lo llena Storage). Fecha/hora las pone el servidor (trigger).
  reported_at timestamptz not null default now(),
  report_date date not null default ((now() at time zone 'America/El_Salvador')::date),
  sku text not null,
  reference text not null,                       -- No. de recepción / OC
  stower_employee_id uuid references admin_employees(id) on delete set null,
  stower_name text not null,                     -- copia del nombre (el historial no cambia si se edita el empleado)
  type_id uuid references storage_isq_types(id) on delete set null,
  type_label text not null,                      -- copia del tipo (se puede renombrar o borrar el tipo sin perder historial)
  extra jsonb not null default '[]'::jsonb,      -- campos extra: [{ field_id, label, value }]

  -- Seguimiento (lo llena Inbound)
  status text not null default 'abierta'
    check (status in ('abierta', 'en_seguimiento', 'corregida', 'no_procede')),
  responsible_employee_id uuid references admin_employees(id) on delete set null,
  responsible_name text,
  root_cause text check (root_cause in ('recepcion', 'proveedor', 'transporte', 'almacenaje', 'otra')),
  corrective_action text,
  followup_notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id)
);

create index if not exists storage_isq_incidents_date_idx on storage_isq_incidents (report_date desc);
create index if not exists storage_isq_incidents_reported_idx on storage_isq_incidents (reported_at desc);
create index if not exists storage_isq_incidents_status_idx on storage_isq_incidents (status);

-- Insert: fecha, hora, autor y estado inicial siempre los pone el servidor.
create or replace function storage_isq_before_insert()
returns trigger language plpgsql as $$
begin
  new.reported_at := now();
  new.report_date := (now() at time zone 'America/El_Salvador')::date;
  new.created_at := now();
  new.created_by := auth.uid();
  new.updated_at := now();
  new.status := 'abierta';
  new.closed_at := null;
  new.closed_by := null;
  return new;
end $$;

drop trigger if exists storage_isq_before_insert on storage_isq_incidents;
create trigger storage_isq_before_insert before insert on storage_isq_incidents
  for each row execute function storage_isq_before_insert();

-- Update: Inbound solo toca el seguimiento; el reporte original solo lo
-- corrige quien configura ISQ (jefe de Storage, gerencia, admin). Cierre
-- automático al pasar a corregida / no_procede.
create or replace function storage_isq_before_update()
returns trigger language plpgsql as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.reported_at := old.reported_at;
  new.report_date := old.report_date;

  if (new.sku, new.reference, new.stower_employee_id, new.stower_name, new.type_id, new.type_label, new.extra)
     is distinct from
     (old.sku, old.reference, old.stower_employee_id, old.stower_name, old.type_id, old.type_label, old.extra)
     and not storage_isq_can_configure() then
    raise exception 'Solo el jefe de Storage, gerencia o admin pueden corregir los datos del reporte.';
  end if;

  if new.status in ('corregida', 'no_procede') then
    if old.status not in ('corregida', 'no_procede') then
      new.closed_at := now();
      new.closed_by := auth.uid();
    else
      new.closed_at := old.closed_at;
      new.closed_by := old.closed_by;
    end if;
  else
    new.closed_at := null;
    new.closed_by := null;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists storage_isq_before_update on storage_isq_incidents;
create trigger storage_isq_before_update before update on storage_isq_incidents
  for each row execute function storage_isq_before_update();

-- updated_at de los catálogos
create or replace function storage_isq_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists storage_isq_types_touch on storage_isq_types;
create trigger storage_isq_types_touch before update on storage_isq_types
  for each row execute function storage_isq_touch();

drop trigger if exists storage_isq_fields_touch on storage_isq_fields;
create trigger storage_isq_fields_touch before update on storage_isq_fields
  for each row execute function storage_isq_touch();

create or replace function storage_isq_settings_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists storage_isq_settings_touch on storage_isq_settings;
create trigger storage_isq_settings_touch before update on storage_isq_settings
  for each row execute function storage_isq_settings_touch();

-- =========================================================================
-- 5. RLS
-- =========================================================================

alter table storage_isq_types enable row level security;
alter table storage_isq_fields enable row level security;
alter table storage_isq_settings enable row level security;
alter table storage_isq_incidents enable row level security;

-- Catálogos: lectura para cualquier usuario activo; escritura solo configuradores.
drop policy if exists "sit_select" on storage_isq_types;
create policy "sit_select" on storage_isq_types for select using (storage_isq_is_user());
drop policy if exists "sit_insert" on storage_isq_types;
create policy "sit_insert" on storage_isq_types for insert with check (storage_isq_can_configure());
drop policy if exists "sit_update" on storage_isq_types;
create policy "sit_update" on storage_isq_types for update
  using (storage_isq_can_configure()) with check (storage_isq_can_configure());
drop policy if exists "sit_delete" on storage_isq_types;
create policy "sit_delete" on storage_isq_types for delete using (storage_isq_can_configure());

drop policy if exists "sif_select" on storage_isq_fields;
create policy "sif_select" on storage_isq_fields for select using (storage_isq_is_user());
drop policy if exists "sif_insert" on storage_isq_fields;
create policy "sif_insert" on storage_isq_fields for insert with check (storage_isq_can_configure());
drop policy if exists "sif_update" on storage_isq_fields;
create policy "sif_update" on storage_isq_fields for update
  using (storage_isq_can_configure()) with check (storage_isq_can_configure());
drop policy if exists "sif_delete" on storage_isq_fields;
create policy "sif_delete" on storage_isq_fields for delete using (storage_isq_can_configure());

drop policy if exists "sis_select" on storage_isq_settings;
create policy "sis_select" on storage_isq_settings for select using (storage_isq_is_user());
drop policy if exists "sis_update" on storage_isq_settings;
create policy "sis_update" on storage_isq_settings for update
  using (storage_isq_can_configure()) with check (storage_isq_can_configure());

-- Incidencias
drop policy if exists "sii_select" on storage_isq_incidents;
create policy "sii_select" on storage_isq_incidents for select using (
  storage_isq_is_manager() or storage_isq_in_module('storage') or storage_isq_in_module('inbound')
);
drop policy if exists "sii_insert" on storage_isq_incidents;
create policy "sii_insert" on storage_isq_incidents for insert with check (
  storage_isq_is_manager() or storage_isq_in_module('storage')
);
drop policy if exists "sii_update" on storage_isq_incidents;
create policy "sii_update" on storage_isq_incidents for update
  using (storage_isq_can_configure() or storage_isq_in_module('inbound'))
  with check (storage_isq_can_configure() or storage_isq_in_module('inbound'));
drop policy if exists "sii_delete" on storage_isq_incidents;
create policy "sii_delete" on storage_isq_incidents for delete using (storage_isq_can_configure());

-- =========================================================================
-- 6. Realtime (Dash Storage, ISQ de Inbound y el Diálogo Táctico se actualizan solos)
-- =========================================================================

do $$
declare t text;
begin
  foreach t in array array['storage_isq_incidents'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
