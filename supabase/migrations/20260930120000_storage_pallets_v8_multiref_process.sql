-- Storage · "Registro x Pallet" + "Control de Referencias" — v8
-- Chat: Dashboard Neuronal (ver ARCHITECTURE.md → "Diálogo Táctico CD Nneo" → v8)
--
-- REQUIERE (ya corrida): 20260929200000_dashboard_tactical_v7_storage_pallets.sql
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Es idempotente (se puede volver a correr).
--
-- Qué hace:
--   1. storage_pallets_is_supervisor()   "coordinador para arriba": gerencia/admin, o
--      usuario con acceso a Storage cuyo PUESTO (Empleados) empieza con
--      Coordinador / Jefe / Gerente
--   2. storage_pallet_record_refs        varias referencias por pallet (cada una con su SKU)
--      + migra los registros de v7 (1 referencia por registro)
--   3. storage_references                estado nuevo DISCREPANCIA + "Procesar"
--      (observación, tipo, SKUs con discrepancia) + seguimiento de Inbound
--   4. Funciones (RPC) para todo cambio: registrar, procesar, reabrir,
--      actualizar/seguimiento, deshacer, editar, eliminar
--   5. Vista storage_references_summary con los campos nuevos
--
-- Permisos:
--   registrar pallets                 gerencia/admin o cualquier usuario de Storage
--   Procesar (almacenado/discrepancia) gerencia/admin o nivel con "editar" en Storage (igual que v7)
--   eliminar registro, reabrir,
--   editar o eliminar referencia      SOLO supervisor (coordinador, jefe, gerente con acceso a Storage; gerencia; admin)
--   actualizar / seguimiento / deshacer gerencia/admin o cualquier usuario de Inbound

-- =========================================================================
-- 1. Supervisor de Storage (por puesto)
-- =========================================================================
create or replace function storage_pallets_is_supervisor()
returns boolean language sql security definer set search_path = public stable as $$
  select storage_isq_is_manager()
      or (
        storage_isq_in_module('storage')
        and exists (
          select 1
          from admin_users u
          join admin_employees e on e.id = u.employee_id
          join admin_positions p on p.id = e.position_id
          where u.auth_user_id = auth.uid()
            and u.active and e.active
            and (p.name ilike 'coordinador%' or p.name ilike 'jefe%' or p.name ilike 'gerente%')
        )
      )
$$;

grant execute on function storage_pallets_is_supervisor() to authenticated;

-- =========================================================================
-- 2. Varias referencias por pallet
-- =========================================================================
-- El registro guarda los pallets (lo que suma el Diálogo Táctico); cada
-- referencia del pallet va en su propia fila, con su cantidad de SKU.
alter table storage_pallet_records alter column reference drop not null;

create table if not exists storage_pallet_record_refs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  record_id uuid not null references storage_pallet_records(id) on delete cascade,
  reference_id uuid not null references storage_references(id) on delete cascade,
  sku_count integer not null default 0 check (sku_count >= 0),
  unique (record_id, reference_id)
);

create index if not exists storage_pallet_record_refs_ref_idx on storage_pallet_record_refs (reference_id);

alter table storage_pallet_record_refs enable row level security;

drop policy if exists "sprr_select" on storage_pallet_record_refs;
create policy "sprr_select" on storage_pallet_record_refs for select using (storage_pallets_can_read());
-- Sin insert/update/delete directos: todo pasa por las funciones de abajo.

-- Registros de v7: cada uno tenía una sola referencia en la propia fila.
insert into storage_pallet_record_refs (record_id, reference_id, sku_count, created_at, created_by)
select p.id, r.id, p.sku_count, p.created_at, p.created_by
from storage_pallet_records p
join storage_references r on r.reference_key = p.reference_key
where p.reference is not null
on conflict (record_id, reference_id) do nothing;

-- Compatibilidad: si algo sigue insertando como en v7 (referencia en la fila
-- del registro), se crea la referencia (si falta) y su enlace.
create or replace function storage_pallet_records_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  new.recorded_at := now();
  new.record_date := (now() at time zone 'America/El_Salvador')::date;
  new.created_at := now();
  new.created_by := auth.uid();
  new.updated_at := now();
  if new.reference is not null then
    new.reference := btrim(new.reference);
    if new.reference = '' then
      new.reference := null;
    else
      select status into st from storage_references where reference_key = upper(new.reference);
      if st is not null and st <> 'en_proceso' then
        raise exception 'La referencia % ya fue procesada (%). Si falta almacenar pallets, pide a un coordinador o jefe que la reabra.',
          new.reference, upper(st);
      end if;
      insert into storage_references (reference, created_by) values (new.reference, auth.uid())
      on conflict (reference_key) do nothing;
    end if;
  end if;
  return new;
end $$;

create or replace function storage_pallet_records_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reference is not null then
    insert into storage_pallet_record_refs (record_id, reference_id, sku_count, created_by)
    select new.id, r.id, new.sku_count, new.created_by
    from storage_references r where r.reference_key = upper(new.reference)
    on conflict (record_id, reference_id) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists storage_pallet_records_after_insert on storage_pallet_records;
create trigger storage_pallet_records_after_insert after insert on storage_pallet_records
  for each row execute function storage_pallet_records_after_insert();

-- Eliminar / corregir un registro: solo supervisor (antes: cualquier nivel con
-- "editar" en Storage, lo que incluía operadores).
drop policy if exists "spr_update" on storage_pallet_records;
create policy "spr_update" on storage_pallet_records
  for update using (storage_pallets_is_supervisor()) with check (storage_pallets_is_supervisor());

drop policy if exists "spr_delete" on storage_pallet_records;
create policy "spr_delete" on storage_pallet_records for delete using (storage_pallets_is_supervisor());

-- =========================================================================
-- 3. Referencias: DISCREPANCIA, Procesar y seguimiento
-- =========================================================================
alter table storage_references drop constraint if exists storage_references_status_check;
alter table storage_references add constraint storage_references_status_check
  check (status in ('en_proceso', 'almacenado', 'discrepancia', 'actualizado'));

alter table storage_references add column if not exists process_type text
  check (process_type in ('total', 'discrepancia'));
alter table storage_references add column if not exists process_note text;
-- [{ "sku": "123", "qty": 4, "kind": "faltante" | "sobrante" | "danado" }]
alter table storage_references add column if not exists discrepancies jsonb not null default '[]'::jsonb;
alter table storage_references add column if not exists followup_note text;
alter table storage_references add column if not exists followup_at timestamptz;
alter table storage_references add column if not exists followup_by uuid references auth.users(id);

update storage_references set process_type = 'total'
where status in ('almacenado', 'actualizado') and process_type is null;

-- Todo cambio va por las funciones de abajo (security definer, validan
-- permisos). Se quitan el update directo y el trigger de v7.
drop policy if exists "sref_update" on storage_references;
drop trigger if exists storage_references_before_update on storage_references;
drop function if exists storage_references_before_update();


-- Si se borra el último pallet de una referencia que sigue EN PROCESO, la
-- referencia también se borra (no quedan referencias vacías).
create or replace function storage_pallet_record_refs_after_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from storage_references r
  where r.id = old.reference_id
    and r.status = 'en_proceso'
    and not exists (select 1 from storage_pallet_record_refs x where x.reference_id = r.id);
  return null;
end $$;

drop trigger if exists storage_pallet_record_refs_after_delete on storage_pallet_record_refs;
create trigger storage_pallet_record_refs_after_delete after delete on storage_pallet_record_refs
  for each row execute function storage_pallet_record_refs_after_delete();

-- =========================================================================
-- 4. Funciones (RPC)
-- =========================================================================

-- 4.1 Registrar un pallet (o varios) con una o más referencias.
-- p_refs: [{ "reference": "OC-1", "sku_count": 3 }, …]
create or replace function storage_register_pallets(
  p_stower_employee_id uuid,
  p_stower_name text,
  p_pallets integer,
  p_refs jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  rec_id uuid;
  item jsonb;
  ref_name text;
  ref_id uuid;
  st text;
  sku integer;
  seen text[] := '{}';
begin
  if not (storage_isq_is_manager() or storage_isq_in_module('storage')) then
    raise exception 'Solo los usuarios de Storage, gerencia o admin pueden registrar pallets.';
  end if;
  if coalesce(btrim(p_stower_name), '') = '' then
    raise exception 'El almacenador es obligatorio.';
  end if;
  if p_pallets is null or p_pallets <= 0 then
    raise exception 'El número de pallets debe ser mayor a 0.';
  end if;
  if p_refs is null or jsonb_typeof(p_refs) <> 'array' or jsonb_array_length(p_refs) = 0 then
    raise exception 'Agrega al menos una referencia.';
  end if;

  insert into storage_pallet_records (stower_employee_id, stower_name, reference, pallets, sku_count)
  values (p_stower_employee_id, btrim(p_stower_name), null, p_pallets, 0)
  returning id into rec_id;

  for item in select * from jsonb_array_elements(p_refs) loop
    ref_name := btrim(coalesce(item->>'reference', ''));
    sku := coalesce(nullif(item->>'sku_count', '')::integer, 0);
    if ref_name = '' then
      raise exception 'Hay una referencia vacía.';
    end if;
    if sku < 0 then
      raise exception 'La cantidad de SKU no puede ser negativa (%).', ref_name;
    end if;
    if upper(ref_name) = any(seen) then
      raise exception 'La referencia % está repetida en el mismo pallet.', ref_name;
    end if;
    seen := seen || upper(ref_name);

    select id, status into ref_id, st from storage_references where reference_key = upper(ref_name);
    if ref_id is null then
      insert into storage_references (reference, created_by) values (ref_name, auth.uid())
      on conflict (reference_key) do nothing
      returning id into ref_id;
      if ref_id is null then
        select id, status into ref_id, st from storage_references where reference_key = upper(ref_name);
      end if;
    end if;
    if st is not null and st <> 'en_proceso' then
      raise exception 'La referencia % ya fue procesada (%). Si falta almacenar pallets, pide a un coordinador o jefe que la reabra.',
        ref_name, upper(st);
    end if;

    insert into storage_pallet_record_refs (record_id, reference_id, sku_count, created_by)
    values (rec_id, ref_id, sku, auth.uid());
    ref_id := null;
    st := null;
  end loop;

  update storage_pallet_records
  set sku_count = (select coalesce(sum(sku_count), 0) from storage_pallet_record_refs where record_id = rec_id)
  where id = rec_id;

  return rec_id;
end $$;

-- 4.2 Procesar (Storage): Almacenado total o Referencia con discrepancia.
-- p_items: [{ "sku": "123", "qty": 4, "kind": "faltante" }, …]
create or replace function storage_reference_process(
  p_id uuid,
  p_type text,
  p_note text,
  p_items jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  st text;
  clean jsonb := '[]'::jsonb;
  item jsonb;
begin
  if not storage_isq_can_configure() then
    raise exception 'Solo el jefe de Storage (o un nivel con "editar" en Storage), gerencia o admin pueden procesar una referencia.';
  end if;
  select status into st from storage_references where id = p_id for update;
  if st is null then raise exception 'La referencia no existe.'; end if;
  if st <> 'en_proceso' then raise exception 'La referencia ya fue procesada.'; end if;
  if p_type not in ('total', 'discrepancia') then raise exception 'Tipo de proceso inválido.'; end if;

  if p_type = 'discrepancia' then
    for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
      if btrim(coalesce(item->>'sku', '')) = '' then
        raise exception 'Hay un SKU vacío en la discrepancia.';
      end if;
      if coalesce(item->>'kind', '') not in ('faltante', 'sobrante', 'danado') then
        raise exception 'Tipo de discrepancia inválido para el SKU %.', item->>'sku';
      end if;
      if coalesce(nullif(item->>'qty', '')::numeric, 0) <= 0 then
        raise exception 'La cantidad del SKU % debe ser mayor a 0.', item->>'sku';
      end if;
      clean := clean || jsonb_build_object(
        'sku', btrim(item->>'sku'),
        'qty', (item->>'qty')::numeric,
        'kind', item->>'kind'
      );
    end loop;
    if jsonb_array_length(clean) = 0 then
      raise exception 'Agrega al menos un SKU con discrepancia.';
    end if;
  end if;

  update storage_references set
    status = case when p_type = 'total' then 'almacenado' else 'discrepancia' end,
    process_type = p_type,
    process_note = nullif(btrim(coalesce(p_note, '')), ''),
    discrepancies = clean,
    stored_at = now(),
    stored_by = auth.uid(),
    followup_note = null, followup_at = null, followup_by = null,
    system_updated_at = null, system_updated_by = null,
    updated_at = now(), updated_by = auth.uid()
  where id = p_id;
end $$;

-- 4.3 Reabrir (Storage, supervisor): vuelve a EN PROCESO y borra el proceso.
create or replace function storage_reference_reopen(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_pallets_is_supervisor() then
    raise exception 'Solo coordinadores, jefes, gerencia o admin pueden reabrir una referencia.';
  end if;
  update storage_references set
    status = 'en_proceso',
    process_type = null, process_note = null, discrepancies = '[]'::jsonb,
    stored_at = null, stored_by = null,
    followup_note = null, followup_at = null, followup_by = null,
    system_updated_at = null, system_updated_by = null,
    updated_at = now(), updated_by = auth.uid()
  where id = p_id;
  if not found then raise exception 'La referencia no existe.'; end if;
end $$;

-- 4.4 Inbound: seguimiento (solo con discrepancia) y/o ACTUALIZADO.
-- Con discrepancia, actualizar exige un seguimiento escrito.
create or replace function storage_reference_inbound_update(
  p_id uuid,
  p_followup text,
  p_mark_updated boolean
) returns void language plpgsql security definer set search_path = public as $$
declare
  st text;
  note text := nullif(btrim(coalesce(p_followup, '')), '');
begin
  if not (storage_isq_is_manager() or storage_isq_in_module('inbound')) then
    raise exception 'Solo Inbound, gerencia o admin pueden actualizar una referencia.';
  end if;
  select status into st from storage_references where id = p_id for update;
  if st is null then raise exception 'La referencia no existe.'; end if;

  if st = 'discrepancia' then
    if note is null and p_mark_updated then
      select followup_note into note from storage_references where id = p_id;
      if note is null then
        raise exception 'Escribe el seguimiento de la discrepancia antes de actualizar.';
      end if;
    end if;
    update storage_references set
      followup_note = coalesce(nullif(btrim(coalesce(p_followup, '')), ''), followup_note),
      followup_at = case when nullif(btrim(coalesce(p_followup, '')), '') is not null then now() else followup_at end,
      followup_by = case when nullif(btrim(coalesce(p_followup, '')), '') is not null then auth.uid() else followup_by end,
      status = case when p_mark_updated then 'actualizado' else status end,
      system_updated_at = case when p_mark_updated then now() else system_updated_at end,
      system_updated_by = case when p_mark_updated then auth.uid() else system_updated_by end,
      updated_at = now(), updated_by = auth.uid()
    where id = p_id;
  elsif st = 'almacenado' then
    if not p_mark_updated then return; end if;
    update storage_references set
      followup_note = coalesce(note, followup_note),
      status = 'actualizado',
      system_updated_at = now(), system_updated_by = auth.uid(),
      updated_at = now(), updated_by = auth.uid()
    where id = p_id;
  else
    raise exception 'Solo se pueden actualizar referencias ya procesadas por Storage.';
  end if;
end $$;

-- 4.5 Inbound: deshacer ACTUALIZADO (vuelve a almacenado o discrepancia).
create or replace function storage_reference_inbound_undo(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (storage_isq_is_manager() or storage_isq_in_module('inbound')) then
    raise exception 'Solo Inbound, gerencia o admin pueden deshacer ACTUALIZADO.';
  end if;
  update storage_references set
    status = case when process_type = 'discrepancia' then 'discrepancia' else 'almacenado' end,
    system_updated_at = null, system_updated_by = null,
    updated_at = now(), updated_by = auth.uid()
  where id = p_id and status = 'actualizado';
  if not found then raise exception 'La referencia no está ACTUALIZADO.'; end if;
end $$;

-- 4.6 Editar (supervisor): nombre de la referencia y SKU por registro.
-- Si el nombre nuevo ya existe en otra referencia, se UNEN (los pallets pasan
-- a la otra, que conserva su estado).
-- p_skus: [{ "id": "<id de storage_pallet_record_refs>", "sku_count": 3 }, …]
create or replace function storage_reference_edit(
  p_id uuid,
  p_reference text,
  p_skus jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_name text := btrim(coalesce(p_reference, ''));
  target uuid;
  item jsonb;
  touched uuid[];
begin
  if not storage_pallets_is_supervisor() then
    raise exception 'Solo coordinadores, jefes, gerencia o admin pueden editar una referencia.';
  end if;
  if not exists (select 1 from storage_references where id = p_id) then
    raise exception 'La referencia no existe.';
  end if;
  if new_name = '' then raise exception 'La referencia no puede quedar vacía.'; end if;

  for item in select * from jsonb_array_elements(coalesce(p_skus, '[]'::jsonb)) loop
    if coalesce(nullif(item->>'sku_count', '')::integer, -1) < 0 then
      raise exception 'La cantidad de SKU debe ser un entero mayor o igual a 0.';
    end if;
    update storage_pallet_record_refs
    set sku_count = (item->>'sku_count')::integer, updated_at = now(), updated_by = auth.uid()
    where id = (item->>'id')::uuid and reference_id = p_id;
  end loop;

  select id into target from storage_references where reference_key = upper(new_name) and id <> p_id;
  if target is null then
    update storage_references
    set reference = new_name, updated_at = now(), updated_by = auth.uid()
    where id = p_id;
    target := p_id;
  else
    -- Unir: si un mismo pallet ya tenía las dos referencias, se suman sus SKU.
    update storage_pallet_record_refs t
    set sku_count = t.sku_count + s.sku_count, updated_at = now(), updated_by = auth.uid()
    from storage_pallet_record_refs s
    where s.reference_id = p_id and t.reference_id = target and t.record_id = s.record_id;
    delete from storage_pallet_record_refs s
    where s.reference_id = p_id
      and exists (select 1 from storage_pallet_record_refs t where t.reference_id = target and t.record_id = s.record_id);
    update storage_pallet_record_refs set reference_id = target, updated_at = now(), updated_by = auth.uid()
    where reference_id = p_id;
    delete from storage_references where id = p_id;
  end if;

  -- Total de SKU de cada registro afectado.
  select array_agg(distinct record_id) into touched from storage_pallet_record_refs where reference_id = target;
  update storage_pallet_records p
  set sku_count = (select coalesce(sum(x.sku_count), 0) from storage_pallet_record_refs x where x.record_id = p.id)
  where p.id = any(coalesce(touched, '{}'));

  return target;
end $$;

-- 4.7 Eliminar referencia (supervisor). Los pallets que solo tenían esta
-- referencia se eliminan (y se restan del Diálogo Táctico); los que tenían
-- otra referencia se conservan.
create or replace function storage_reference_delete(p_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  recs uuid[];
  removed integer;
begin
  if not storage_pallets_is_supervisor() then
    raise exception 'Solo coordinadores, jefes, gerencia o admin pueden eliminar una referencia.';
  end if;
  select coalesce(array_agg(record_id), '{}') into recs from storage_pallet_record_refs where reference_id = p_id;
  delete from storage_references where id = p_id;
  if not found then raise exception 'La referencia no existe.'; end if;
  delete from storage_pallet_records p
  where p.id = any(recs)
    and not exists (select 1 from storage_pallet_record_refs x where x.record_id = p.id);
  get diagnostics removed = row_count;
  update storage_pallet_records p
  set sku_count = (select coalesce(sum(x.sku_count), 0) from storage_pallet_record_refs x where x.record_id = p.id)
  where p.id = any(recs);
  return removed;
end $$;

-- 4.8 Eliminar un registro de pallet (supervisor). Sus referencias vacías que
-- sigan EN PROCESO se borran solas (trigger de arriba).
create or replace function storage_pallet_record_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_pallets_is_supervisor() then
    raise exception 'Solo coordinadores, jefes, gerencia o admin pueden eliminar registros.';
  end if;
  delete from storage_pallet_records where id = p_id;
  if not found then raise exception 'El registro no existe.'; end if;
end $$;

revoke all on function storage_register_pallets(uuid, text, integer, jsonb) from public, anon;
revoke all on function storage_reference_process(uuid, text, text, jsonb) from public, anon;
revoke all on function storage_reference_reopen(uuid) from public, anon;
revoke all on function storage_reference_inbound_update(uuid, text, boolean) from public, anon;
revoke all on function storage_reference_inbound_undo(uuid) from public, anon;
revoke all on function storage_reference_edit(uuid, text, jsonb) from public, anon;
revoke all on function storage_reference_delete(uuid) from public, anon;
revoke all on function storage_pallet_record_delete(uuid) from public, anon;
grant execute on function storage_register_pallets(uuid, text, integer, jsonb) to authenticated;
grant execute on function storage_reference_process(uuid, text, text, jsonb) to authenticated;
grant execute on function storage_reference_reopen(uuid) to authenticated;
grant execute on function storage_reference_inbound_update(uuid, text, boolean) to authenticated;
grant execute on function storage_reference_inbound_undo(uuid) to authenticated;
grant execute on function storage_reference_edit(uuid, text, jsonb) to authenticated;
grant execute on function storage_reference_delete(uuid) to authenticated;
grant execute on function storage_pallet_record_delete(uuid) to authenticated;

-- =========================================================================
-- 5. Vista de totales por referencia
-- =========================================================================
-- Un pallet con 2 referencias cuenta 1 pallet para CADA referencia (y 1 solo
-- pallet en el Diálogo Táctico).
drop view if exists storage_references_summary;
create view storage_references_summary
with (security_invoker = true) as
select
  r.id,
  r.reference,
  r.reference_key,
  r.status,
  r.created_at,
  r.stored_at,
  r.system_updated_at,
  r.process_type,
  r.process_note,
  r.discrepancies,
  r.followup_note,
  r.followup_at,
  coalesce(sum(p.pallets), 0)::int   as pallets,
  coalesce(sum(x.sku_count), 0)::int as sku_count,
  count(x.id)::int                   as records,
  min(p.recorded_at)                 as first_recorded_at,
  max(p.recorded_at)                 as last_recorded_at
from storage_references r
left join storage_pallet_record_refs x on x.reference_id = r.id
left join storage_pallet_records p on p.id = x.record_id
group by r.id;

-- =========================================================================
-- 6. Realtime
-- =========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'storage_pallet_record_refs'
  ) then
    alter publication supabase_realtime add table storage_pallet_record_refs;
  end if;
end $$;

-- Lectura desde el frontend (la RLS / security_invoker siguen decidiendo qué filas).
grant select on storage_pallet_record_refs to authenticated;
grant select on storage_references_summary to authenticated;
