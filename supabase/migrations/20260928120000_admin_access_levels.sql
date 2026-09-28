-- Configuraciones y Administradores · Niveles de acceso (catálogo dinámico)
-- Chat de módulo: Configuraciones y Administradores (ver ARCHITECTURE.md →
-- "Roles y accesos" → "Niveles de acceso (catálogo dinámico, 2026-09-28)")
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run,
-- en el proyecto único de NeurALE. Requiere que ya esté corrida
-- 20260916120000_admin_setup.sql. Idempotente (se puede volver a correr).
--
-- Motivo: hasta ahora "nivel de acceso" era un enum fijo de 4 valores
-- (admin/gerencia/jefe_area/operador), cada uno con UN módulo por usuario
-- (columna admin_users.module). Josué pidió poder crear nuevos niveles de
-- acceso desde la app, cada uno con su propia combinación de módulos +
-- si puede solo VER o también EDITAR dentro de ellos, y asignarlos luego
-- en Usuarios y Roles — junto a los 4 niveles que ya existían.
--
-- Diseño (pensado para no romper nada de lo que ya está en producción):
--   - Los 4 niveles de siempre (Admin, Gerencia, Jefe de área, Operador) se
--     seedean aquí como niveles "de sistema" (columna `legacy_key`), así
--     aparecen listados junto a los nuevos — pero técnicamente NO cambian:
--     `admin_users.access_level`/`module` se les sigue asignando exactamente
--     igual que antes, y ninguna RLS/función que ya dependa de esos valores
--     (`admin_current_access()`, la RLS de `admin_users`, las funciones del
--     Diálogo Táctico, etc.) se toca en esta migración.
--   - Un nivel NUEVO (creado desde la pantalla "Niveles de Acceso") no tiene
--     `legacy_key`: al asignarlo a un usuario, `admin_users.access_level`
--     pasa a valer 'custom' (valor nuevo, agregado aquí a los CHECK) y
--     `module` queda en null — su matriz real de módulos vive en
--     `admin_access_level_modules`.
--   - IMPORTANTE — alcance de esta ronda: 'custom' solo controla la ENTRADA
--     a cada módulo en el frontend (`RequireAccess`/`allowModule` — ver
--     `src/shared/auth/RequireAccess.tsx`). Que "ver" bloquee además cada
--     botón de guardar/crear DENTRO de cada módulo (Inbound, Storage,
--     Picking, Outbound, Inventory, el propio Diálogo Táctico) queda
--     pendiente de coordinar con cada chat de módulo — igual que ya está
--     pendiente conectar la RLS de esos módulos al rol real (ver
--     ARCHITECTURE.md → "Roles y accesos" → "Decisión de secuencia").
--
-- Seguridad: a diferencia de admin_positions/admin_branches (catálogos de
-- bajo riesgo que hoy tienen RLS permisiva temporal), estas dos tablas
-- nuevas SÍ llevan RLS real desde el inicio — deciden quién entra a qué
-- módulo, así que no conviene dejarlas editables por cualquier sesión
-- autenticada mientras se llega a la fase final de roles.

-- =========================================================================
-- 1. Catálogo de niveles de acceso
-- =========================================================================

create table if not exists admin_access_levels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  name text not null unique,
  -- No nulo SOLO en los 4 niveles de sistema: liga la fila de este catálogo
  -- con el access_level real de siempre en admin_users. Null = nivel nuevo,
  -- creado desde la pantalla ("custom").
  legacy_key text check (legacy_key in ('admin', 'gerencia', 'jefe_area', 'operador')),
  active boolean not null default true
);

-- Un solo nivel de sistema por legacy_key (protege contra duplicar "Admin", etc.).
create unique index if not exists admin_access_levels_legacy_key_key
  on admin_access_levels (legacy_key)
  where legacy_key is not null;

alter table admin_access_levels enable row level security;

drop policy if exists "admin_access_levels_select" on admin_access_levels;
create policy "admin_access_levels_select"
  on admin_access_levels
  for select
  using (true); -- cualquier usuario con sesión necesita leer el catálogo (ej. el select de Usuarios y Roles)

drop policy if exists "admin_access_levels_insert" on admin_access_levels;
create policy "admin_access_levels_insert"
  on admin_access_levels
  for insert
  with check (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')));

drop policy if exists "admin_access_levels_update" on admin_access_levels;
create policy "admin_access_levels_update"
  on admin_access_levels
  for update
  using (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')))
  with check (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')));

drop policy if exists "admin_access_levels_delete" on admin_access_levels;
create policy "admin_access_levels_delete"
  on admin_access_levels
  for delete
  using (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')));

insert into admin_access_levels (name, legacy_key) values
  ('Admin', 'admin'),
  ('Gerencia', 'gerencia'),
  ('Jefe de área', 'jefe_area'),
  ('Operador', 'operador')
on conflict (name) do nothing;

-- =========================================================================
-- 2. Matriz nivel → módulo → permiso
-- =========================================================================
-- `module` cubre los 5 módulos de negocio + 'dashboard' + 'admin' (los 7
-- destinos que hoy protege RequireAccess en routes.tsx). Solo tiene uso
-- real para niveles NUEVOS (legacy_key is null): para Admin/Gerencia se
-- deja como fila de referencia (siempre tienen acceso total, por la misma
-- regla de siempre — no depende de esta tabla); Jefe de área/Operador no
-- tienen fila aquí porque su único módulo se sigue asignando por usuario
-- (admin_users.module), no por nivel.

create table if not exists admin_access_level_modules (
  id uuid primary key default gen_random_uuid(),
  access_level_id uuid not null references admin_access_levels(id) on delete cascade,
  module text not null check (
    module in ('inbound', 'storage', 'picking', 'outbound', 'inventory', 'dashboard', 'admin')
  ),
  permission text not null check (permission in ('ver', 'editar')),
  unique (access_level_id, module)
);

alter table admin_access_level_modules enable row level security;

drop policy if exists "admin_access_level_modules_select" on admin_access_level_modules;
create policy "admin_access_level_modules_select"
  on admin_access_level_modules
  for select
  using (true);

drop policy if exists "admin_access_level_modules_insert" on admin_access_level_modules;
create policy "admin_access_level_modules_insert"
  on admin_access_level_modules
  for insert
  with check (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')));

drop policy if exists "admin_access_level_modules_update" on admin_access_level_modules;
create policy "admin_access_level_modules_update"
  on admin_access_level_modules
  for update
  using (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')))
  with check (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')));

drop policy if exists "admin_access_level_modules_delete" on admin_access_level_modules;
create policy "admin_access_level_modules_delete"
  on admin_access_level_modules
  for delete
  using (exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia')));

-- Admin/Gerencia: fila de referencia con acceso total (editar en los 7 destinos).
insert into admin_access_level_modules (access_level_id, module, permission)
select l.id, m.module, 'editar'
from admin_access_levels l
cross join (
  values ('inbound'), ('storage'), ('picking'), ('outbound'), ('inventory'), ('dashboard'), ('admin')
) as m(module)
where l.legacy_key in ('admin', 'gerencia')
on conflict (access_level_id, module) do nothing;

-- =========================================================================
-- 3. admin_users: liga cada usuario a un nivel del catálogo
-- =========================================================================

alter table admin_users add column if not exists access_level_id uuid references admin_access_levels(id);

alter table admin_users drop constraint if exists admin_users_access_level_check;
alter table admin_users add constraint admin_users_access_level_check
  check (access_level in ('admin', 'gerencia', 'jefe_area', 'operador', 'custom'));

alter table admin_users drop constraint if exists admin_users_module_shape;
alter table admin_users add constraint admin_users_module_shape check (
  (access_level in ('admin', 'gerencia', 'custom') and module is null)
  or (access_level in ('jefe_area', 'operador') and module is not null)
);

-- Backfill: liga cada usuario ya existente a su nivel "de sistema" equivalente.
update admin_users u
set access_level_id = l.id
from admin_access_levels l
where l.legacy_key = u.access_level
  and u.access_level_id is null;
