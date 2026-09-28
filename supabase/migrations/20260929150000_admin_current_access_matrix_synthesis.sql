-- Configuraciones y Administradores · admin_current_access() reconoce la
-- matriz de "Niveles de Acceso" dentro de cada módulo (no solo la entrada)
-- Chat de módulo: Configuraciones y Administradores (ver ARCHITECTURE.md →
-- "Roles y accesos" → "Niveles de acceso (catálogo dinámico)" → "Ampliación
-- 2026-09-29: acceso real dentro de cada módulo").
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Requiere que ya estén corridas las migraciones de "Niveles de Acceso"
-- (20260928120000 y 20260929090000). Idempotente.
--
-- Motivo: Josué pidió que un nivel de acceso (no solo Jefe de área/Operador)
-- pueda de verdad "editar" dentro de un módulo — no solo entrar. El caso
-- concreto: un usuario con el nivel personalizado "Inventario" (editar en
-- 'inventory') entra al módulo, pero el Diálogo Táctico del Dashboard y el
-- ISQ de Storage lo siguen tratando como si no tuviera nada, porque esas dos
-- funciones (de otros chats, ya en producción) comparan literalmente
-- `access_level = 'jefe_area'` — un nivel personalizado nunca entra ahí.
--
-- Diseño (para NO tener que tocar ni un archivo de Dashboard ni de Storage):
-- `admin_current_access()` es la única función que ambos chats reutilizan
-- para leer "el rol real" del usuario (así se documentó a propósito desde el
-- 2026-09-16). Hoy devuelve como máximo 1 fila (access_level, module) leída
-- directo de admin_users. Esta migración le agrega, como filas EXTRA, una
-- traducción de la matriz (`admin_access_level_modules`) al mismo lenguaje
-- de siempre: un 'editar' en un módulo de negocio se traduce a una fila
-- (access_level: 'jefe_area', module: <ese módulo>) — el mismo nivel de
-- gestión que ya tenía jefe_area — y un 'ver' se traduce a
-- (access_level: 'operador', module: <ese módulo>). Como toda la RLS que
-- ya existe (`dashboard_is_area_lead()`, `storage_isq_in_module()`,
-- `storage_isq_can_configure()`, la propia RLS de `admin_users`, y
-- cualquier función nueva que un chat de módulo escriba reutilizando esta
-- misma función) hace `where exists (select 1 from admin_current_access() c
-- where ...)`, agregar filas es 100% compatible sin tocar ni una línea de
-- esas funciones: para ellas, un nivel personalizado con 'editar' en
-- 'inventory' se ve exactamente igual que un jefe_area de inventory de
-- toda la vida.
--
-- Es aditivo y no quita nada: admin/gerencia/jefe_area/operador que no usen
-- la matriz siguen viendo exactamente la misma fila de antes (además de,
-- para admin/gerencia, unas filas extra redundantes que no cambian nada,
-- porque ya pasan todo por ser admin/gerencia). Solo cubre los 5 módulos de
-- negocio (no 'dashboard' ni 'admin', que nunca fueron valores válidos de
-- `admin_users.module` y ninguna función existente los espera ahí).
--
-- Para que esto tenga efecto también en el frontend (mostrar el formulario
-- de captura del Diálogo Táctico / habilitar botones del ISQ, no solo la
-- RLS), ver también los nuevos helpers `hasModuleAccess`/`canManageModule`
-- en `src/shared/auth/RequireAccess.tsx`, usados desde
-- `dashboard/tactical/TacticalCaptureView.tsx` y `storage/isq/ui.tsx`.

create or replace function admin_current_access()
returns table (access_level text, module text)
language sql
security definer
set search_path = public
stable
as $$
  (
    select access_level, module
    from admin_users
    where auth_user_id = auth.uid() and active
    limit 1
  )
  union
  select
    case m.permission when 'editar' then 'jefe_area' else 'operador' end,
    m.module
  from admin_users u
  join admin_access_level_modules m on m.access_level_id = u.access_level_id
  where u.auth_user_id = auth.uid()
    and u.active
    and m.module in ('inbound', 'storage', 'picking', 'outbound', 'inventory')
$$;
