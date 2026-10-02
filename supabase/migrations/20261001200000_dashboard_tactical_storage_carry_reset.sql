-- Dashboard Neuronal · Diálogo Táctico — Storage: reiniciar el pendiente
-- Chat: Dashboard Neuronal (ver ARCHITECTURE.md → "Diálogo Táctico — reinicio del pendiente de Storage")
--
-- REQUIERE (ya corrida): 20260929200000_dashboard_tactical_v7_storage_pallets.sql
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Es idempotente (se puede volver a correr).
--
-- Qué hace: en la fila de Storage (process_id = 'alm') de una casilla (turno,
-- o día si solo hay un turno habilitado) se puede marcar que el pendiente que
-- venía arrastrado NO existe (salieron menos pallets que el promedio por
-- contenedor). Esa casilla arranca solo con el plan del día y el pendiente
-- anterior se descarta.
--
-- Permisos: los mismos de la fila de Storage (jefe de Storage o nivel con
-- "editar" en Storage, gerencia, admin) — ya los da la RLS existente de
-- dashboard_tactical_process. Quién y cuándo: updated_by / updated_at.

alter table dashboard_tactical_process
  add column if not exists carry_reset_at timestamptz,
  add column if not exists carry_reset_pallets integer check (carry_reset_pallets is null or carry_reset_pallets >= 0);

comment on column dashboard_tactical_process.carry_reset_at is
  'Storage: si no es nulo, esta casilla descarta el pendiente arrastrado de la casilla anterior.';
comment on column dashboard_tactical_process.carry_reset_pallets is
  'Storage: pallets de pendiente descartados al reiniciar (para el historial).';
