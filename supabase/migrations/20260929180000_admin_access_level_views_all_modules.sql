-- Configuraciones y Administradores · Niveles de acceso — granularidad por
-- pantalla en TODOS los destinos (antes solo en 'admin')
-- Chat de módulo: Configuraciones y Administradores (ver ARCHITECTURE.md →
-- "Roles y accesos" → "Niveles de acceso (catálogo dinámico)" → ampliación
-- 2026-09-29 "Granularidad por pantalla en todos los módulos")
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run,
-- en el proyecto único de NeurALE. Requiere que ya esté corrida
-- 20260929090000_admin_access_levels_view_and_editable.sql. Idempotente (se
-- puede volver a correr sin duplicar nada ni romper datos existentes).
--
-- Qué cambia: la migración anterior solo dejaba usar un `view` distinto de
-- 'all' para module = 'admin' (con un CHECK que lo exigía). Ahora se pidió
-- que CUALQUIERA de los 7 destinos (Inbound, Storage, Picking, Outbound,
-- Inventory, Dashboard, Admin) pueda tener filas de pantalla suelta en la
-- matriz de un nivel de acceso, no solo Admin — así se puede armar, por
-- ejemplo, "Outbound → Gestión de Rutas → editar" sin darle todo Outbound.
-- Solo se relaja el CHECK; nada más de la tabla, de `admin_current_access()`
-- ni de la RLS existente cambia. No hace falta tocar filas ya guardadas: las
-- que ya usaban 'all' o una pantalla de admin siguen siendo válidas.

alter table admin_access_level_modules drop constraint if exists admin_access_level_modules_module_view_check;
alter table admin_access_level_modules add constraint admin_access_level_modules_module_view_check
  check (view <> '');
