-- Storage · Auditoría OPL — detalle por llave (LPN / ubicación) en "Resultados y avance"
-- Chat de módulo: Storage (2026-11-15). Ver ARCHITECTURE.md → "Storage — Auditoría OPL".
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Requiere: 20261114120000_storage_opl_audit.sql. Idempotente. No crea ni cambia tablas.
--
-- Qué hace:
--   storage_opl_audit_keys(p_audit)  todas las llaves de una auditoría (las del formato y los
--   sobrantes) con su estado de conteo, para buscar y ver qué falta por contar.
--   Conserva el CONTEO CIEGO: quien solo cuenta ve qué llaves faltan, quién contó y cuándo,
--   pero nunca la cantidad esperada ni lo que contaron otros (solo lo suyo).
--   Pensada para leerse por páginas (.range()) desde el frontend.

create or replace function storage_opl_audit_keys(p_audit uuid)
returns table (
  key_value text, sku text, description text, location text, extra jsonb,
  is_extra boolean, counted boolean, counted_by text, counted_at timestamptz,
  recounted boolean, recount_by text, recount_at timestamptz,
  expected numeric, counted_qty numeric, recount_qty numeric
) language plpgsql security definer set search_path = public stable as $$
declare v_manage boolean := storage_opl_can_manage();
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  return query
  select l.key_value, l.sku, l.description, l.location, l.extra,
         false, l.counted_qty is not null, l.counted_by_name, l.counted_at,
         l.recount_qty is not null, l.recount_by_name, l.recount_at,
         case when v_manage then l.expected_qty end,
         case when v_manage or l.counted_by = auth.uid() then l.counted_qty end,
         case when v_manage or l.recount_by = auth.uid() then l.recount_qty end
  from storage_opl_audit_lines l where l.audit_id = p_audit
  union all
  select x.key_value, x.sku, x.description, x.location, '{}'::jsonb,
         true, true, x.created_by_name, x.created_at,
         false, null::text, null::timestamptz,
         case when v_manage then 0::numeric end,
         x.qty, null::numeric
  from storage_opl_audit_extras x where x.audit_id = p_audit
  order by 2, 4 nulls last, 1, 6;
end $$;

revoke all on function storage_opl_audit_keys(uuid) from public;
grant execute on function storage_opl_audit_keys(uuid) to authenticated;
