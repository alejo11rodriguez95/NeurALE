-- Configuraciones y Administradores · contraseña temporal + login flexible
-- Chat de módulo: Configuraciones y Administradores (ver ARCHITECTURE.md)
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
--
-- 1) Contraseña temporal: al crear un usuario, `must_change_password` queda
--    en true; en el primer login, `RequireAccess` (frontend) obliga a elegir
--    una contraseña propia antes de dejarlo entrar a cualquier módulo. Las
--    cuentas que ya existían antes de esta migración NO quedan marcadas
--    (default false al agregar la columna) — si quieres forzar el cambio
--    también en alguna cuenta ya creada, pon manualmente
--    `must_change_password = true` en su fila desde Table Editor.
--
-- 2) Login flexible: además del correo completo, se puede entrar con la
--    parte antes de la @ (ej. "josue.rodriguez") o con el código de
--    empleado (para quien no tiene correo real). `email_local` es una
--    columna generada (parte antes de la @, en minúscula) que la Edge
--    Function usa para resolver ese segundo caso — no se llena a mano.

alter table admin_users
  add column if not exists must_change_password boolean not null default false;

alter table admin_users
  add column if not exists email_local text
  generated always as (lower(split_part(email, '@', 1))) stored;

create index if not exists admin_users_email_local_idx on admin_users (email_local);
