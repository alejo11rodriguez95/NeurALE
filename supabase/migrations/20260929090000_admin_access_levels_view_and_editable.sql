-- Configuraciones y Administradores · Niveles de acceso — granularidad por
-- pantalla + niveles de sistema editables
-- Chat de módulo: Configuraciones y Administradores (ver ARCHITECTURE.md →
-- "Roles y accesos" → "Niveles de acceso (catálogo dinámico, 2026-09-28)")
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run,
-- en el proyecto único de NeurALE. Requiere que ya esté corrida
-- 20260928120000_admin_access_levels.sql. Idempotente (se puede volver a
-- correr sin duplicar nada ni romper datos existentes).
--
-- Qué agrega esta migración (sobre la ya corrida el 2026-09-28):
--   1. Una columna `view` en `admin_access_level_modules`, para poder cubrir
--      pantallas sueltas DENTRO de un módulo — hoy solo tiene sentido real
--      para 'admin' (Configuraciones y Administradores, los 7 destinos que
--      ya conoce este chat: ajustes/usuarios/niveles/empleados/puestos/
--      muelles/sucursales). Para los otros 6 destinos (Inbound, Storage,
--      Picking, Outbound, Inventory, Dashboard) sigue siendo por módulo
--      completo — esos módulos los mantienen otros chats y sus pantallas
--      todavía cambian seguido (p.ej. "ISQ" se agregó a varios después de
--      esta misma conversación), así que un catálogo de pantallas fijo ahí
--      quedaría desactualizado casi de inmediato. El valor 'all' (por
--      defecto) sigue significando "el módulo completo".
--   2. Nada cambia en `admin_current_access()`, la RLS de `admin_users`, ni
--      en el Diálogo Táctico/ISQ de Storage — esta ronda solo permite que
--      Gerencia, Jefe de área y Operador (Admin queda siempre bloqueado)
--      tengan, ADEMÁS de su acceso de siempre, filas propias en esta misma
--      tabla para ENTRAR a módulos/pantallas extra — es 100% aditivo, nunca
--      quita nada de lo que ya tenían.

alter table admin_access_level_modules add column if not exists view text not null default 'all';

alter table admin_access_level_modules drop constraint if exists admin_access_level_modules_module_view_check;
alter table admin_access_level_modules add constraint admin_access_level_modules_module_view_check
  check (view = 'all' or module = 'admin');

alter table admin_access_level_modules drop constraint if exists admin_access_level_modules_access_level_id_module_key;
alter table admin_access_level_modules drop constraint if exists admin_access_level_modules_access_level_id_module_view_key;
alter table admin_access_level_modules add constraint admin_access_level_modules_access_level_id_module_view_key
  unique (access_level_id, module, view);
