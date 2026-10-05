-- Inventory · Control de Averías — v3: descripción del producto, "No aplica como
-- avería" y reporte de mal manejo por período (semana o mes cerrado).
-- Chat de módulo: Inventory (ver ARCHITECTURE.md → "Inventory — Control de Averías").
--
-- REQUIERE (ya corridas): 20261001120000_inventory_damage_control.sql y
--                         20261001180000_inventory_damage_single_email.sql
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Es idempotente (se puede volver a correr).
-- ORDEN: correr ESTE SQL ANTES de subir el código nuevo a GitHub (el formulario
-- nuevo manda la descripción del producto; el formulario viejo sigue
-- funcionando con este SQL ya corrido).
--
-- Cambios pedidos por Josué (2026-10-05):
--   1. El formulario del QR pide una breve descripción del producto después del SKU.
--   2. Al trabajar un lote, cada SKU puede marcarse "No aplica como avería": no
--      entra al reporte impreso para el ajuste, pero sí al reporte de mal manejo
--      si incumplió políticas.
--   3. El reporte de mal manejo por área + correo único (CC a los jefes) ya NO se
--      hace en cada lote: se hace por SEMANA (lunes a domingo) o por MES ya
--      terminados, con las averías de los lotes CONFIRMADOS en ese período. Al
--      cerrar el período, sus averías quedan amarradas a él y no se repiten en
--      otro reporte.
--
-- Qué hace:
--   inventory_damage_reports.product_description  descripción del producto (null en reportes viejos)
--   inventory_damage_reports.not_applicable       "No aplica como avería" (lo marca Inventory en el lote)
--   inventory_damage_reports.period_id            período de mal manejo cerrado que la incluyó
--   inventory_damage_periods                      reportes de mal manejo por semana / mes
--   inventory_damage_period_notes                 observación de seguimiento por área dentro del período
--   inventory_damage_submit()                     + p_description (opcional para no romper el formulario viejo)
--   inventory_damage_set_not_applicable()         marcar / desmarcar en un lote abierto
--   inventory_damage_batch_close()                ya NO exige correo (pasa al período)
--   inventory_damage_batch_cancel()               limpia "No aplica" al devolver a PENDIENTE
--   inventory_damage_period_*()                   crear, observaciones, correo, cerrar, reabrir, descartar

-- =========================================================================
-- 1. Columnas nuevas en reportes
-- =========================================================================
alter table inventory_damage_reports add column if not exists product_description text;
alter table inventory_damage_reports add column if not exists not_applicable boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_damage_reports_desc_len') then
    alter table inventory_damage_reports
      add constraint inventory_damage_reports_desc_len check (product_description is null or length(product_description) <= 200);
  end if;
end $$;

-- =========================================================================
-- 2. Períodos de mal manejo
-- =========================================================================
create table if not exists inventory_damage_periods (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  kind text not null check (kind in ('semana', 'mes')),
  start_date date not null,
  end_date date not null,
  status text not null default 'abierto' check (status in ('abierto', 'cerrado')),
  general_note text,
  emailed_at timestamptz,
  emailed_by uuid references auth.users(id),
  emailed_to text[] not null default '{}',
  emailed_cc text[] not null default '{}',
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  check (end_date >= start_date),
  unique (kind, start_date)
);

create table if not exists inventory_damage_period_notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  period_id uuid not null references inventory_damage_periods(id) on delete cascade,
  origin_id uuid not null references inventory_damage_origins(id),
  origin_name text not null,
  note text,
  unique (period_id, origin_id)
);

alter table inventory_damage_reports add column if not exists period_id uuid references inventory_damage_periods(id) on delete set null;
create index if not exists inventory_damage_reports_period_idx on inventory_damage_reports (period_id);
create index if not exists inventory_damage_batches_closed_idx on inventory_damage_batches (closed_at);

do $$
declare t text;
begin
  foreach t in array array['inventory_damage_periods', 'inventory_damage_period_notes'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function inventory_touch()', t || '_touch', t);
  end loop;
end $$;

alter table inventory_damage_periods enable row level security;
alter table inventory_damage_period_notes enable row level security;

drop policy if exists "idper_select" on inventory_damage_periods;
create policy "idper_select" on inventory_damage_periods for select using (inventory_can_read());

drop policy if exists "idpn_select" on inventory_damage_period_notes;
create policy "idpn_select" on inventory_damage_period_notes for select using (inventory_can_read());

-- =========================================================================
-- 3. Formulario público: descripción del producto
-- =========================================================================
-- Se reemplaza la firma de 7 parámetros por una de 8. p_description tiene
-- default null para que el formulario viejo (todavía en el aire mientras se
-- sube el código nuevo) siga funcionando; el formulario nuevo la exige.
drop function if exists inventory_damage_submit(text, text, uuid, text, integer, boolean, text);

create or replace function inventory_damage_submit(
  p_token text,
  p_employee_code text,
  p_origin_id uuid,
  p_sku text,
  p_quantity integer,
  p_deducted boolean,
  p_observation text,
  p_description text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  e record;
  o record;
  v_folio bigint;
  v_recent integer;
begin
  if not inventory_damage_token_ok(p_token) then
    raise exception 'El código QR ya no es válido. Pide a Inventory el QR vigente.';
  end if;

  select id, full_name, employee_code into e
  from admin_employees
  where active and lower(btrim(employee_code)) = lower(btrim(coalesce(p_employee_code, '')))
  limit 1;
  if e.id is null then raise exception 'Código de empleado no encontrado o inactivo.'; end if;

  select id, name into o from inventory_damage_origins where id = p_origin_id and active;
  if o.id is null then raise exception 'Selecciona el origen de la avería.'; end if;

  if btrim(coalesce(p_sku, '')) = '' then raise exception 'Escribe el SKU.'; end if;
  if p_description is not null and btrim(p_description) = '' then raise exception 'Escribe una breve descripción del producto.'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que 0.'; end if;
  if p_quantity > 100000 then raise exception 'Cantidad fuera de rango.'; end if;
  if p_deducted is null then raise exception 'Confirma si se descontó de la existencia de la ubicación.'; end if;
  if btrim(coalesce(p_observation, '')) = '' then raise exception 'Escribe una observación.'; end if;
  if length(p_observation) > 1000 or length(p_sku) > 60 or length(coalesce(p_description, '')) > 200 then
    raise exception 'Texto demasiado largo.';
  end if;

  -- Freno básico contra abuso del link público: máx. 30 reportes por colaborador cada 10 minutos.
  select count(*) into v_recent from inventory_damage_reports
  where reporter_employee_id = e.id and created_at > now() - interval '10 minutes';
  if v_recent >= 30 then raise exception 'Demasiados reportes seguidos. Espera unos minutos.'; end if;

  insert into inventory_damage_reports (
    created_by, reporter_employee_id, reporter_code, reporter_name, origin_id, origin_name,
    sku, product_description, quantity, deducted_from_location, observation
  ) values (
    auth.uid(), e.id, e.employee_code, e.full_name, o.id, o.name,
    upper(btrim(p_sku)), nullif(btrim(coalesce(p_description, '')), ''), p_quantity, p_deducted, btrim(p_observation)
  ) returning folio into v_folio;
  return v_folio;
end $$;

revoke all on function inventory_damage_submit(text, text, uuid, text, integer, boolean, text, text) from public;
grant execute on function inventory_damage_submit(text, text, uuid, text, integer, boolean, text, text) to anon, authenticated;

-- =========================================================================
-- 4. Lotes: "No aplica como avería", cierre sin correo, cancelar
-- =========================================================================
create or replace function inventory_damage_set_not_applicable(p_report_id uuid, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform inventory_damage_require_manage();
  select id, batch_id into r from inventory_damage_reports where id = p_report_id;
  if r.id is null or r.batch_id is null then raise exception 'La avería no está en un lote de trabajo.'; end if;
  perform inventory_damage_open_batch(r.batch_id);
  update inventory_damage_reports set not_applicable = coalesce(p_value, false) where id = p_report_id;
end $$;

-- El correo de mal manejo ya no se hace por lote (v3): se confirma sin correo.
create or replace function inventory_damage_batch_close(p_batch_id uuid, p_final_note text, p_erp_ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_batch(p_batch_id);

  update inventory_damage_batches
  set status = 'actualizado',
      final_note = nullif(btrim(coalesce(p_final_note, '')), ''),
      erp_adjustment_ref = nullif(btrim(coalesce(p_erp_ref, '')), ''),
      closed_at = now(),
      closed_by = auth.uid()
  where id = p_batch_id;

  update inventory_damage_reports set status = 'actualizado' where batch_id = p_batch_id;
end $$;

create or replace function inventory_damage_batch_cancel(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_batch(p_batch_id);
  update inventory_damage_reports set status = 'pendiente', batch_id = null, not_applicable = false where batch_id = p_batch_id;
  delete from inventory_damage_batches where id = p_batch_id;
end $$;

-- =========================================================================
-- 5. Períodos de mal manejo (semana lunes–domingo o mes calendario)
-- =========================================================================
create or replace function inventory_damage_today_sv()
returns date language sql stable as $$
  select (now() at time zone 'America/El_Salvador')::date
$$;

-- Averías de un período: las de lotes CONFIRMADOS (ACTUALIZADO) cuya fecha de
-- confirmación (hora de El Salvador) cae en el período. Abierto: las que todavía
-- no tomó otro período cerrado. Cerrado: las que quedaron amarradas a él.
create or replace function inventory_damage_period_report_ids(p_period_id uuid)
returns setof uuid language sql security definer set search_path = public stable as $$
  select r.id
  from inventory_damage_periods p
  join inventory_damage_batches b
    on b.status = 'actualizado'
   and (b.closed_at at time zone 'America/El_Salvador')::date between p.start_date and p.end_date
  join inventory_damage_reports r on r.batch_id = b.id
  where p.id = p_period_id
    and p.status = 'abierto'
    and (r.period_id is null or r.period_id = p.id)
    and inventory_can_read()
  union
  select r.id
  from inventory_damage_periods p
  join inventory_damage_reports r on r.period_id = p.id
  where p.id = p_period_id
    and p.status = 'cerrado'
    and inventory_can_read()
$$;
revoke all on function inventory_damage_period_report_ids(uuid) from public, anon;
grant execute on function inventory_damage_period_report_ids(uuid) to authenticated;

create or replace function inventory_damage_open_period(p_id uuid)
returns inventory_damage_periods language plpgsql security definer set search_path = public as $$
declare p inventory_damage_periods;
begin
  select * into p from inventory_damage_periods where id = p_id for update;
  if p.id is null then raise exception 'Reporte de período no encontrado.'; end if;
  if p.status <> 'abierto' then raise exception 'El reporte del período ya está cerrado. Reábrelo para modificarlo.'; end if;
  return p;
end $$;
revoke all on function inventory_damage_open_period(uuid) from public, anon, authenticated;

-- Crea (o devuelve, si ya existe) el reporte de una semana o un mes YA TERMINADO.
create or replace function inventory_damage_period_create(p_kind text, p_start date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_end date;
  v_id uuid;
begin
  perform inventory_damage_require_manage();
  if p_kind = 'semana' then
    if extract(isodow from p_start) <> 1 then raise exception 'La semana debe empezar en lunes.'; end if;
    v_end := p_start + 6;
  elsif p_kind = 'mes' then
    if extract(day from p_start) <> 1 then raise exception 'El mes debe empezar el día 1.'; end if;
    v_end := (p_start + interval '1 month' - interval '1 day')::date;
  else
    raise exception 'Tipo de período inválido (semana o mes).';
  end if;
  if v_end >= inventory_damage_today_sv() then
    raise exception 'Solo se puede generar el reporte de una semana o un mes ya terminados.';
  end if;

  select id into v_id from inventory_damage_periods where kind = p_kind and start_date = p_start;
  if v_id is not null then return v_id; end if;

  insert into inventory_damage_periods (kind, start_date, end_date, created_by)
  values (p_kind, p_start, v_end, auth.uid())
  on conflict (kind, start_date) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from inventory_damage_periods where kind = p_kind and start_date = p_start;
  end if;
  return v_id;
end $$;

create or replace function inventory_damage_period_save_note(p_period_id uuid, p_origin_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_period(p_period_id);
  select id, name into o from inventory_damage_origins where id = p_origin_id;
  if o.id is null then raise exception 'Departamento no encontrado.'; end if;
  insert into inventory_damage_period_notes (period_id, origin_id, origin_name, note, created_by)
  values (p_period_id, o.id, o.name, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  on conflict (period_id, origin_id) do update set note = excluded.note, origin_name = excluded.origin_name;
end $$;

create or replace function inventory_damage_period_save(p_period_id uuid, p_general_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_period(p_period_id);
  update inventory_damage_periods set general_note = nullif(btrim(coalesce(p_general_note, '')), '') where id = p_period_id;
end $$;

create or replace function inventory_damage_period_mark_emailed(p_period_id uuid, p_to text[], p_cc text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_period(p_period_id);
  if not exists (
    select 1 from inventory_damage_findings f
    where f.report_id in (select inventory_damage_period_report_ids(p_period_id))
  ) then
    raise exception 'Este período no tiene averías con mal manejo: no hace falta correo.';
  end if;
  update inventory_damage_periods
  set emailed_at = now(),
      emailed_by = auth.uid(),
      emailed_to = inventory_damage_clean_emails(p_to),
      emailed_cc = inventory_damage_clean_emails(p_cc)
  where id = p_period_id;
end $$;

-- Cierra el período: exige el correo si hubo mal manejo y amarra sus averías
-- (no vuelven a salir en otro reporte de período).
create or replace function inventory_damage_period_close(p_period_id uuid, p_general_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p inventory_damage_periods;
  v_ids uuid[];
begin
  perform inventory_damage_require_manage();
  p := inventory_damage_open_period(p_period_id);
  select coalesce(array_agg(x), '{}') into v_ids from inventory_damage_period_report_ids(p_period_id) as x;

  if exists (select 1 from inventory_damage_findings where report_id = any (v_ids)) and p.emailed_at is null then
    raise exception 'Falta abrir el correo de seguimiento por mal manejo del período.';
  end if;

  update inventory_damage_reports set period_id = p_period_id where id = any (v_ids);
  update inventory_damage_periods
  set status = 'cerrado',
      general_note = nullif(btrim(coalesce(p_general_note, '')), ''),
      closed_at = now(),
      closed_by = auth.uid()
  where id = p_period_id;
end $$;

-- Reabre un período cerrado: suelta sus averías (se vuelven a calcular).
create or replace function inventory_damage_period_reopen(p_period_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare st text;
begin
  perform inventory_damage_require_manage();
  select status into st from inventory_damage_periods where id = p_period_id for update;
  if st is null then raise exception 'Reporte de período no encontrado.'; end if;
  if st <> 'cerrado' then raise exception 'El reporte del período ya está abierto.'; end if;
  update inventory_damage_reports set period_id = null where period_id = p_period_id;
  update inventory_damage_periods set status = 'abierto', closed_at = null, closed_by = null where id = p_period_id;
end $$;

-- Descarta un reporte de período ABIERTO (borrador).
create or replace function inventory_damage_period_delete(p_period_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_period(p_period_id);
  delete from inventory_damage_periods where id = p_period_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'inventory_damage_set_not_applicable(uuid, boolean)',
    'inventory_damage_batch_close(uuid, text, text)',
    'inventory_damage_batch_cancel(uuid)',
    'inventory_damage_period_create(text, date)',
    'inventory_damage_period_save_note(uuid, uuid, text)',
    'inventory_damage_period_save(uuid, text)',
    'inventory_damage_period_mark_emailed(uuid, text[], text[])',
    'inventory_damage_period_close(uuid, text)',
    'inventory_damage_period_reopen(uuid)',
    'inventory_damage_period_delete(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- =========================================================================
-- 6. Realtime
-- =========================================================================
do $$
declare t text;
begin
  foreach t in array array['inventory_damage_periods', 'inventory_damage_period_notes'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
