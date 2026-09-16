-- Outbound · Control de Calidad + Gestión de Rutas
-- Chat de módulo: Outbound (ver ARCHITECTURE.md → "Módulos y orden de trabajo")
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run,
-- en el proyecto único de NeurALE (mismo proyecto que usan los demás módulos).
--
-- Sigue las reglas obligatorias de ARCHITECTURE.md → "Roles y accesos" mientras
-- no hay autenticación: RLS habilitado desde el inicio con política temporal
-- permisiva, y columna `created_by` (default auth.uid(), por ahora queda NULL)
-- en toda tabla transaccional.

-- =========================================================================
-- 1. Control de Calidad (incidencias de preparación)
-- =========================================================================

create table if not exists outbound_quality_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),

  -- Qué se encontró
  sku text not null,
  quantity numeric not null,
  lot text,
  expiration_date date,
  unit_of_measure text not null,
  branch text not null,
  order_number text not null,
  location text,

  -- Tipo de error
  error_type text not null check (error_type in (
    'faltante',
    'sobrante',
    'averia',
    'producto_incorrecto',
    'pedido_incompleto',
    'sobre_stock'
  )),

  -- Quién preparó / verificó (texto libre por ahora — cuando exista el módulo
  -- de administrador de personal, estos campos pasan a ser un select alimentado
  -- por esa tabla, sin cambiar la forma de esta columna)
  prepared_by text not null,
  verified_by text not null,

  -- Seguimiento (lo usa "Gestión de Control de Calidad" en Picking)
  status text not null default 'abierta' check (status in ('abierta', 'en_seguimiento', 'resuelta')),
  assigned_to text,
  resolution_notes text,
  resolved_at timestamptz
);

alter table outbound_quality_incidents enable row level security;

create policy "outbound_quality_incidents_temp_all"
  on outbound_quality_incidents
  for all
  using (true)
  with check (true);

create index if not exists outbound_quality_incidents_status_idx
  on outbound_quality_incidents (status);
create index if not exists outbound_quality_incidents_created_at_idx
  on outbound_quality_incidents (created_at desc);

-- =========================================================================
-- 2. Gestión de Rutas (muelles, motoristas, llegada/salida de camiones)
-- =========================================================================

-- 9 muelles físicos del CD. Catálogo pequeño y estable: se administra por SQL,
-- no necesita pantalla propia por ahora.
create table if not exists outbound_docks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  code text not null unique,   -- 'M1'..'M9' — también es el contenido del QR impreso
  label text not null
);

alter table outbound_docks enable row level security;

create policy "outbound_docks_temp_all"
  on outbound_docks
  for all
  using (true)
  with check (true);

insert into outbound_docks (code, label)
select 'M' || n, 'Muelle ' || n
from generate_series(1, 9) as n
on conflict (code) do nothing;

-- Motoristas (transportistas de las rutas de despacho). Base propia de
-- Outbound — no es el módulo de administrador de personal interno.
create table if not exists outbound_drivers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  full_name text not null,
  license_plate_assigned text,
  active boolean not null default true
);

alter table outbound_drivers enable row level security;

create policy "outbound_drivers_temp_all"
  on outbound_drivers
  for all
  using (true)
  with check (true);

-- Un registro por camión que entra a un muelle: llegada (automática al
-- escanear el QR del muelle) hasta salida (al registrarla desde la app).
create table if not exists outbound_dock_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),

  dock_id uuid not null references outbound_docks(id),
  arrived_at timestamptz not null default now(),
  departed_at timestamptz,

  vehicle_plate text not null,
  driver_id uuid references outbound_drivers(id),
  responsible text not null,
  pallet_count integer,
  branches_loaded text[],

  status text not null default 'en_muelle' check (status in ('en_muelle', 'despachado'))
);

alter table outbound_dock_visits enable row level security;

create policy "outbound_dock_visits_temp_all"
  on outbound_dock_visits
  for all
  using (true)
  with check (true);

create index if not exists outbound_dock_visits_dock_id_idx on outbound_dock_visits (dock_id);
create index if not exists outbound_dock_visits_status_idx on outbound_dock_visits (status);
