-- Inventory · Control de Averías — v2: UN solo correo de seguimiento por lote
-- Chat de módulo: Inventory (ver claude/INVENTORY_CONTROL_AVERIAS.md).
--
-- REQUIERE (ya corrida): 20261001120000_inventory_damage_control.sql
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Es idempotente (se puede volver a correr).
--
-- Cambio pedido por Josué (2026-10-01): en vez de un correo por departamento,
-- el lote lleva UN solo correo con el detalle de mal manejo separado por área,
-- con copia (CC) a los jefes de todas las áreas involucradas.
--
-- Qué hace:
--   1. inventory_damage_settings.mail_to   destinatario(s) principal(es) del correo (Para)
--   2. inventory_damage_batches.emailed_*  registro de que se abrió el correo del lote
--   3. inventory_damage_settings_save()    guardar el destinatario principal
--   4. inventory_damage_batch_mark_emailed() registrar el correo del lote
--   5. inventory_damage_set_finding()      si cambia el mal manejo después de abrir el
--                                          correo, hay que volver a abrirlo (el anterior quedó viejo)
--   6. inventory_damage_batch_close()      exige el correo del lote (ya no uno por área)
--
-- La observación de seguimiento por área sigue en inventory_damage_notices
-- (columna note); sus columnas emailed_* quedan sin uso.

-- =========================================================================
-- 1–2. Columnas nuevas
-- =========================================================================
alter table inventory_damage_settings add column if not exists mail_to text[] not null default '{}';

alter table inventory_damage_batches add column if not exists emailed_at timestamptz;
alter table inventory_damage_batches add column if not exists emailed_by uuid references auth.users(id);
alter table inventory_damage_batches add column if not exists emailed_to text[] not null default '{}';
alter table inventory_damage_batches add column if not exists emailed_cc text[] not null default '{}';

-- =========================================================================
-- 3. Destinatario principal (Ajustes)
-- =========================================================================
create or replace function inventory_damage_clean_emails(p_emails text[])
returns text[] language plpgsql immutable as $$
declare v text[];
begin
  select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x) <> ''), '{}')
    into v from unnest(coalesce(p_emails, '{}')) as x;
  if exists (select 1 from unnest(v) x where x !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Hay un correo con formato inválido.';
  end if;
  return v;
end $$;
revoke all on function inventory_damage_clean_emails(text[]) from public, anon, authenticated;

create or replace function inventory_damage_settings_save(p_mail_to text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  update inventory_damage_settings set mail_to = inventory_damage_clean_emails(p_mail_to) where id = 1;
end $$;

-- =========================================================================
-- 4. Correo del lote
-- =========================================================================
create or replace function inventory_damage_batch_mark_emailed(p_batch_id uuid, p_to text[], p_cc text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_batch(p_batch_id);
  if not exists (select 1 from inventory_damage_findings where batch_id = p_batch_id) then
    raise exception 'Este lote no tiene averías con mal manejo: no hace falta correo.';
  end if;
  update inventory_damage_batches
  set emailed_at = now(),
      emailed_by = auth.uid(),
      emailed_to = inventory_damage_clean_emails(p_to),
      emailed_cc = inventory_damage_clean_emails(p_cc)
  where id = p_batch_id;
end $$;

-- =========================================================================
-- 5. Marcar / desmarcar política: invalida el correo ya abierto
-- =========================================================================
create or replace function inventory_damage_set_finding(p_report_id uuid, p_policy_id uuid, p_failed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
  v_changed integer;
begin
  perform inventory_damage_require_manage();
  select id, batch_id into r from inventory_damage_reports where id = p_report_id;
  if r.id is null or r.batch_id is null then raise exception 'La avería no está en un lote de trabajo.'; end if;
  perform inventory_damage_open_batch(r.batch_id);

  if p_failed then
    select id, label into p from inventory_damage_policies where id = p_policy_id;
    if p.id is null then raise exception 'Política no encontrada.'; end if;
    insert into inventory_damage_findings (batch_id, report_id, policy_id, policy_label, created_by)
    values (r.batch_id, r.id, p.id, p.label, auth.uid())
    on conflict (report_id, policy_id) do nothing;
  else
    delete from inventory_damage_findings where report_id = p_report_id and policy_id = p_policy_id;
  end if;
  get diagnostics v_changed = row_count;

  -- El correo ya abierto describe un mal manejo distinto al actual: hay que reabrirlo.
  if v_changed > 0 then
    update inventory_damage_batches set emailed_at = null, emailed_by = null where id = r.batch_id;
  end if;

  -- Observaciones de áreas que ya no tienen mal manejo: se descartan.
  delete from inventory_damage_notices n
  where n.batch_id = r.batch_id
    and not exists (
      select 1 from inventory_damage_findings f
      join inventory_damage_reports x on x.id = f.report_id
      where f.batch_id = n.batch_id and x.origin_id = n.origin_id
    );
end $$;

-- =========================================================================
-- 6. Confirmar: exige el correo único del lote
-- =========================================================================
create or replace function inventory_damage_batch_close(p_batch_id uuid, p_final_note text, p_erp_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare b inventory_damage_batches;
begin
  perform inventory_damage_require_manage();
  b := inventory_damage_open_batch(p_batch_id);

  if exists (select 1 from inventory_damage_findings where batch_id = p_batch_id) and b.emailed_at is null then
    raise exception 'Falta enviar el correo de seguimiento por mal manejo de este lote.';
  end if;

  update inventory_damage_batches
  set status = 'actualizado',
      final_note = nullif(btrim(coalesce(p_final_note, '')), ''),
      erp_adjustment_ref = nullif(btrim(coalesce(p_erp_ref, '')), ''),
      closed_at = now(),
      closed_by = auth.uid()
  where id = p_batch_id;

  update inventory_damage_reports set status = 'actualizado' where batch_id = p_batch_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'inventory_damage_settings_save(text[])',
    'inventory_damage_batch_mark_emailed(uuid, text[], text[])',
    'inventory_damage_set_finding(uuid, uuid, boolean)',
    'inventory_damage_batch_close(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
