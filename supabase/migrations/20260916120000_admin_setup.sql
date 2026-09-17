-- Configuraciones y Administradores · modelo de datos
-- Chat de módulo: Configuraciones y Administradores (ver ARCHITECTURE.md →
-- "Módulos y orden de trabajo" y "Roles y accesos")
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run,
-- en el proyecto único de NeurALE (mismo proyecto que usan los demás módulos).
--
-- A diferencia de los demás módulos, aquí SÍ se implementa login real
-- (decisión 2026-09-16, ver ARCHITECTURE.md → "Roles y accesos" →
-- "Gestión de usuarios adelantada"). Por eso `admin_users` lleva RLS real
-- (nadie puede escribir esa tabla directo desde el frontend: toda alta/edición
-- pasa por la Edge Function `admin-manage-user`, que usa la service_role key
-- del lado del servidor). Las demás tablas de este chat (`admin_settings`,
-- `admin_positions`, `admin_employees`, `admin_branches`) siguen, por ahora,
-- la misma regla temporal permisiva que el resto de la app mientras no haya
-- necesidad real de restringirlas más — la pantalla ya aplica las reglas de
-- negocio (quién puede crear/editar qué).

-- =========================================================================
-- 1. Ajustes de la plataforma
-- =========================================================================

create table if not exists admin_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table admin_settings enable row level security;

create policy "admin_settings_temp_all"
  on admin_settings
  for all
  using (true)
  with check (true);

-- Semilla: nombre del CD como primer ajuste (editable desde "Ajustes de la
-- plataforma"). Agrega más filas aquí conforme se necesiten nuevos parámetros.
insert into admin_settings (key, value, description)
values ('cd_name', '"CD NNEO"', 'Nombre del centro de distribución, mostrado en la plataforma')
on conflict (key) do nothing;

-- =========================================================================
-- 2. Puestos (catálogo controlado)
-- =========================================================================

create table if not exists admin_positions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  active boolean not null default true
);

alter table admin_positions enable row level security;

create policy "admin_positions_temp_all"
  on admin_positions
  for all
  using (true)
  with check (true);

insert into admin_positions (name) values
  ('Gerente CD Nneo'),
  ('Jefe de Almacenamiento'),
  ('Coordinador Almacenamiento'),
  ('Almacenador'),
  ('Rellenador'),
  ('Aux. Montacargas'),
  ('Coordinador Preparación'),
  ('Aux. Libro Preparación'),
  ('Preparador'),
  ('Jefe de Recepción'),
  ('Aux. Revisión Imp.'),
  ('Aux. Recepción Imp.'),
  ('Encargado de Revisión'),
  ('Jefe de Despacho'),
  ('Encargado Despacho'),
  ('Aux. Despacho'),
  ('Enviñetador'),
  ('Revisador'),
  ('Digitador')
on conflict (name) do nothing;

-- =========================================================================
-- 3. Sucursales (catálogo compartido — resuelve `branch`/`branches_loaded`
--    en Outbound, hoy texto libre)
-- =========================================================================

create table if not exists admin_branches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  code text not null unique,
  name text not null,
  active boolean not null default true
);

alter table admin_branches enable row level security;

create policy "admin_branches_temp_all"
  on admin_branches
  for all
  using (true)
  with check (true);

-- =========================================================================
-- 4. Empleados (catálogo maestro — resuelve `prepared_by`/`verified_by`/
--    `responsible` en Outbound, hoy texto libre)
-- =========================================================================

create table if not exists admin_employees (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),

  employee_code text not null unique,
  full_name text not null,
  position_id uuid references admin_positions(id),
  active boolean not null default true
);

alter table admin_employees enable row level security;

create policy "admin_employees_temp_all"
  on admin_employees
  for all
  using (true)
  with check (true);

create index if not exists admin_employees_position_id_idx on admin_employees (position_id);

-- =========================================================================
-- 5. Usuarios y Roles (cuentas con acceso real a NeurALE)
-- =========================================================================
-- Un usuario SIEMPRE parte de un empleado ya existente (no se crean usuarios
-- sueltos). El alta/edición real (incluida la contraseña) se hace por la
-- Edge Function `admin-manage-user`, nunca insertando/actualizando esta
-- tabla directo desde el frontend — por eso no hay policy de insert/update
-- para el rol `authenticated`/`anon` más abajo: la Edge Function usa la
-- service_role key (nunca expuesta al frontend) y por lo tanto no pasa por RLS.

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),

  employee_id uuid not null references admin_employees(id),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,

  access_level text not null check (access_level in ('admin', 'gerencia', 'jefe_area', 'operador')),
  -- null solo cuando access_level es 'admin' o 'gerencia' (transversales, no
  -- pertenecen a un solo módulo)
  module text check (module in ('inbound', 'storage', 'picking', 'outbound', 'inventory')),
  active boolean not null default true,

  constraint admin_users_module_shape check (
    (access_level in ('admin', 'gerencia') and module is null)
    or (access_level in ('jefe_area', 'operador') and module is not null)
  )
);

alter table admin_users enable row level security;

-- Función helper (security definer): evita la recursión de RLS al consultar
-- admin_users dentro de su propia policy. Se reutiliza también si otro chat
-- de módulo necesita leer el rol real del usuario actual más adelante.
create or replace function admin_current_access()
returns table (access_level text, module text)
language sql
security definer
set search_path = public
stable
as $$
  select access_level, module
  from admin_users
  where auth_user_id = auth.uid() and active
  limit 1
$$;

-- Lectura: cada quien ve su propia fila; admin/gerencia ven todas; jefe_area
-- ve las de su propio módulo (para administrar solo a sus operadores).
create policy "admin_users_select"
  on admin_users
  for select
  using (
    auth_user_id = auth.uid()
    or exists (
      select 1 from admin_current_access() c
      where c.access_level in ('admin', 'gerencia')
    )
    or exists (
      select 1 from admin_current_access() c
      where c.access_level = 'jefe_area' and c.module = admin_users.module
    )
  );

-- Sin policy de insert/update/delete: toda escritura pasa por la Edge
-- Function `admin-manage-user` (service_role, valida los mismos permisos
-- del lado del servidor antes de escribir).

-- =========================================================================
-- Nota sobre `outbound_docks`
-- =========================================================================
-- No requiere cambios de esquema: sigue siendo la misma tabla de Outbound
-- (ver supabase/migrations/20260914120000_outbound_quality_and_routes.sql),
-- solo que ahora se administra (agregar/quitar muelles) desde una pantalla
-- de este chat en vez de por SQL manual.
