-- Inventory · Control de Averías
-- Chat de módulo: Inventory (ver ARCHITECTURE.md → "Inventory — Control de Averías").
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Requiere que ya estén corridas las migraciones de Configuraciones y
-- Administradores (`admin_current_access()`, `admin_employees`,
-- `admin_positions`). Es idempotente: se puede volver a correr sin duplicar nada.
--
-- Qué crea:
--   inventory_damage_settings   fila única: token del QR (se puede regenerar)
--   inventory_damage_origins    catálogo de orígenes (departamento/área) + correos del responsable
--   inventory_damage_policies   catálogo de políticas de manejo de averías
--   inventory_damage_reports    reportes de avería (los llena el colaborador desde el QR)
--   inventory_damage_batches    lotes de trabajo de Inventory (averías trabajadas juntas)
--   inventory_damage_findings   políticas NO cumplidas por reporte dentro de un lote (= mal manejo)
--   inventory_damage_notices    correo de seguimiento por departamento dentro de un lote
--
-- RLS REAL por rol desde el inicio (no la permisiva temporal), igual que
-- Storage ISQ / Registro x Pallet: el login ya está en producción y la URL es
-- pública. Ninguna tabla tiene insert/update/delete directo — todo pasa por
-- funciones `security definer` que validan permiso y estado.
--
--   leer todo                        admin, gerencia o cualquier usuario con acceso a Inventory
--   trabajar averías, ajustes        admin, gerencia, jefe_area de Inventory o nivel con "editar" en Inventory
--   reportar avería (formulario QR)  CUALQUIERA con el link del QR vigente (sin sesión), validando
--                                    el token del QR y el código de empleado activo

-- =========================================================================
-- 0. Helpers de acceso (reutilizan admin_current_access())
-- =========================================================================
create or replace function inventory_is_manager()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from admin_current_access() c where c.access_level in ('admin', 'gerencia'))
$$;

create or replace function inventory_can_read()
returns boolean language sql security definer set search_path = public stable as $$
  select inventory_is_manager()
      or exists (select 1 from admin_current_access() c where c.module = 'inventory')
$$;

-- "editar" en Inventory se sintetiza como jefe_area/inventory en admin_current_access().
create or replace function inventory_can_manage()
returns boolean language sql security definer set search_path = public stable as $$
  select inventory_is_manager()
      or exists (select 1 from admin_current_access() c where c.access_level = 'jefe_area' and c.module = 'inventory')
$$;

revoke all on function inventory_is_manager() from public;
revoke all on function inventory_can_read() from public;
revoke all on function inventory_can_manage() from public;
grant execute on function inventory_is_manager() to anon, authenticated;
grant execute on function inventory_can_read() to anon, authenticated;
grant execute on function inventory_can_manage() to anon, authenticated;

create or replace function inventory_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- =========================================================================
-- 1. Tablas
-- =========================================================================
create table if not exists inventory_damage_settings (
  id smallint primary key default 1 check (id = 1),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  qr_token text not null default replace(gen_random_uuid()::text, '-', '')
);
insert into inventory_damage_settings (id) values (1) on conflict (id) do nothing;

create table if not exists inventory_damage_origins (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  name text not null check (btrim(name) <> ''),
  emails text[] not null default '{}',
  sort_order integer not null default 0,
  active boolean not null default true
);
create unique index if not exists inventory_damage_origins_name_key on inventory_damage_origins (lower(btrim(name)));

create table if not exists inventory_damage_policies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  -- 'not_deducted' = se marca sola como incumplida si el colaborador reportó
  -- que NO se descontó de la existencia de la ubicación.
  code text unique,
  label text not null check (btrim(label) <> ''),
  description text,
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists inventory_damage_batches (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  worked_by_name text not null default '',
  status text not null default 'en_trabajo' check (status in ('en_trabajo', 'actualizado')),
  final_note text,
  erp_adjustment_ref text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id)
);

create table if not exists inventory_damage_reports (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  -- null cuando se reporta desde el QR sin sesión; el colaborador queda en reporter_*.
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  reporter_employee_id uuid not null references admin_employees(id),
  reporter_code text not null,
  reporter_name text not null,
  origin_id uuid not null references inventory_damage_origins(id),
  origin_name text not null,
  sku text not null check (btrim(sku) <> ''),
  quantity integer not null check (quantity > 0),
  deducted_from_location boolean not null,
  observation text not null check (btrim(observation) <> ''),
  status text not null default 'pendiente' check (status in ('pendiente', 'en_trabajo', 'actualizado')),
  batch_id uuid references inventory_damage_batches(id) on delete set null,
  check ((status = 'pendiente') = (batch_id is null))
);
create index if not exists inventory_damage_reports_status_idx on inventory_damage_reports (status, created_at desc);
create index if not exists inventory_damage_reports_batch_idx on inventory_damage_reports (batch_id);
create index if not exists inventory_damage_reports_created_idx on inventory_damage_reports (created_at desc);

create table if not exists inventory_damage_findings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  batch_id uuid not null references inventory_damage_batches(id) on delete cascade,
  report_id uuid not null references inventory_damage_reports(id) on delete cascade,
  policy_id uuid not null references inventory_damage_policies(id),
  policy_label text not null,
  unique (report_id, policy_id)
);
create index if not exists inventory_damage_findings_batch_idx on inventory_damage_findings (batch_id);

create table if not exists inventory_damage_notices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  batch_id uuid not null references inventory_damage_batches(id) on delete cascade,
  origin_id uuid not null references inventory_damage_origins(id),
  origin_name text not null,
  emails text[] not null default '{}',
  note text,
  -- Se registra cuando el usuario abre el correo armado desde NeurALE.
  -- NeurALE no puede confirmar que Outlook lo haya enviado.
  emailed_at timestamptz,
  emailed_by uuid references auth.users(id),
  unique (batch_id, origin_id)
);

-- updated_at / updated_by
do $$
declare t text;
begin
  foreach t in array array['inventory_damage_settings', 'inventory_damage_origins', 'inventory_damage_policies',
                           'inventory_damage_batches', 'inventory_damage_reports', 'inventory_damage_notices'] loop
    execute format('drop trigger if exists %I on %I', t || '_touch', t);
    execute format('create trigger %I before update on %I for each row execute function inventory_touch()', t || '_touch', t);
  end loop;
end $$;

-- =========================================================================
-- 2. Datos iniciales
-- =========================================================================
insert into inventory_damage_origins (name, sort_order)
select v.name, v.ord
from (values ('Inbound', 1), ('Storage', 2), ('Picking', 3), ('Outbound', 4), ('Inventory', 5)) as v(name, ord)
where not exists (select 1 from inventory_damage_origins o where lower(btrim(o.name)) = lower(v.name));

insert into inventory_damage_policies (code, label, description, sort_order)
values
  ('not_deducted', 'Descontada de la ubicación', 'La avería se descontó de la existencia de la ubicación al retirarla.', 1),
  ('full_set', 'Juego completo', 'Si el SKU se despacha por juego, se sacó el juego completo como avería.', 2),
  ('labeled', 'Rotulada oportunamente', 'La avería se rotuló en el momento en que se detectó.', 3),
  ('liquid_bagged', 'Líquido embolsado', 'Si el producto contiene líquido, se embolsó para evitar derrames.', 4)
on conflict (code) do nothing;

-- =========================================================================
-- 3. RLS (solo lectura directa; toda escritura por funciones)
-- =========================================================================
alter table inventory_damage_settings enable row level security;
alter table inventory_damage_origins enable row level security;
alter table inventory_damage_policies enable row level security;
alter table inventory_damage_reports enable row level security;
alter table inventory_damage_batches enable row level security;
alter table inventory_damage_findings enable row level security;
alter table inventory_damage_notices enable row level security;

drop policy if exists "ids_select" on inventory_damage_settings;
create policy "ids_select" on inventory_damage_settings for select using (inventory_can_manage());

drop policy if exists "ido_select" on inventory_damage_origins;
create policy "ido_select" on inventory_damage_origins for select using (inventory_can_read());

drop policy if exists "idp_select" on inventory_damage_policies;
create policy "idp_select" on inventory_damage_policies for select using (inventory_can_read());

drop policy if exists "idr_select" on inventory_damage_reports;
create policy "idr_select" on inventory_damage_reports for select using (inventory_can_read());

drop policy if exists "idb_select" on inventory_damage_batches;
create policy "idb_select" on inventory_damage_batches for select using (inventory_can_read());

drop policy if exists "idf_select" on inventory_damage_findings;
create policy "idf_select" on inventory_damage_findings for select using (inventory_can_read());

drop policy if exists "idn_select" on inventory_damage_notices;
create policy "idn_select" on inventory_damage_notices for select using (inventory_can_read());

-- =========================================================================
-- 4. Formulario público del QR (sin sesión)
-- =========================================================================
-- Solo exponen lo mínimo: los orígenes activos, y el nombre de UN empleado
-- cuando se escribe su código exacto (nunca listan el directorio).
create or replace function inventory_damage_token_ok(p_token text)
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from inventory_damage_settings s where s.id = 1 and s.qr_token = btrim(coalesce(p_token, '')))
$$;
revoke all on function inventory_damage_token_ok(text) from public, anon, authenticated;

create or replace function inventory_damage_public_form(p_token text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
begin
  if not inventory_damage_token_ok(p_token) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'origins', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name) order by o.sort_order, o.name)
      from inventory_damage_origins o where o.active
    ), '[]'::jsonb)
  );
end $$;

create or replace function inventory_damage_lookup_employee(p_token text, p_code text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare e record;
begin
  if not inventory_damage_token_ok(p_token) then
    raise exception 'El código QR ya no es válido. Pide a Inventory el QR vigente.';
  end if;
  select id, full_name, employee_code into e
  from admin_employees
  where active and lower(btrim(employee_code)) = lower(btrim(coalesce(p_code, '')))
  limit 1;
  if e.id is null then return null; end if;
  return jsonb_build_object('id', e.id, 'full_name', e.full_name, 'employee_code', e.employee_code);
end $$;

create or replace function inventory_damage_submit(
  p_token text,
  p_employee_code text,
  p_origin_id uuid,
  p_sku text,
  p_quantity integer,
  p_deducted boolean,
  p_observation text
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
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que 0.'; end if;
  if p_quantity > 100000 then raise exception 'Cantidad fuera de rango.'; end if;
  if p_deducted is null then raise exception 'Confirma si se descontó de la existencia de la ubicación.'; end if;
  if btrim(coalesce(p_observation, '')) = '' then raise exception 'Escribe una observación.'; end if;
  if length(p_observation) > 1000 or length(p_sku) > 60 then raise exception 'Texto demasiado largo.'; end if;

  -- Freno básico contra abuso del link público: máx. 30 reportes por colaborador cada 10 minutos.
  select count(*) into v_recent from inventory_damage_reports
  where reporter_employee_id = e.id and created_at > now() - interval '10 minutes';
  if v_recent >= 30 then raise exception 'Demasiados reportes seguidos. Espera unos minutos.'; end if;

  insert into inventory_damage_reports (
    created_by, reporter_employee_id, reporter_code, reporter_name, origin_id, origin_name,
    sku, quantity, deducted_from_location, observation
  ) values (
    auth.uid(), e.id, e.employee_code, e.full_name, o.id, o.name,
    upper(btrim(p_sku)), p_quantity, p_deducted, btrim(p_observation)
  ) returning folio into v_folio;
  return v_folio;
end $$;

revoke all on function inventory_damage_public_form(text) from public;
revoke all on function inventory_damage_lookup_employee(text, text) from public;
revoke all on function inventory_damage_submit(text, text, uuid, text, integer, boolean, text) from public;
grant execute on function inventory_damage_public_form(text) to anon, authenticated;
grant execute on function inventory_damage_lookup_employee(text, text) to anon, authenticated;
grant execute on function inventory_damage_submit(text, text, uuid, text, integer, boolean, text) to anon, authenticated;

-- =========================================================================
-- 5. Trabajo de Inventory (lotes)
-- =========================================================================
create or replace function inventory_damage_require_manage()
returns void language plpgsql security definer set search_path = public stable as $$
begin
  if not inventory_can_manage() then
    raise exception 'Tu nivel de acceso no puede trabajar averías (requiere "editar" en Inventory).';
  end if;
end $$;
revoke all on function inventory_damage_require_manage() from public, anon, authenticated;

create or replace function inventory_damage_open_batch(p_id uuid)
returns inventory_damage_batches language plpgsql security definer set search_path = public as $$
declare b inventory_damage_batches;
begin
  select * into b from inventory_damage_batches where id = p_id for update;
  if b.id is null then raise exception 'Lote no encontrado.'; end if;
  if b.status <> 'en_trabajo' then raise exception 'El lote ya fue confirmado como ACTUALIZADO; no se puede modificar.'; end if;
  return b;
end $$;
revoke all on function inventory_damage_open_batch(uuid) from public, anon, authenticated;

-- Crea un lote con los reportes pendientes elegidos (por defecto todos). Si
-- alguno ya lo tomó otro lote mientras tanto, simplemente no entra.
create or replace function inventory_damage_batch_start(p_report_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid;
  v_name text;
  v_count integer;
begin
  perform inventory_damage_require_manage();
  if p_report_ids is null or cardinality(p_report_ids) = 0 then
    raise exception 'Selecciona al menos una avería.';
  end if;

  select coalesce(e.full_name, u.email) into v_name
  from admin_users u left join admin_employees e on e.id = u.employee_id
  where u.auth_user_id = auth.uid() limit 1;

  insert into inventory_damage_batches (created_by, worked_by_name)
  values (auth.uid(), coalesce(v_name, '')) returning id into v_batch;

  update inventory_damage_reports
  set status = 'en_trabajo', batch_id = v_batch
  where id = any(p_report_ids) and status = 'pendiente';
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'Esas averías ya no están pendientes (otro usuario pudo haberlas tomado). Recarga la lista.';
  end if;

  -- Política "Descontada de la ubicación": si el colaborador dijo que NO se
  -- descontó, ya queda marcada como incumplida (se puede desmarcar).
  insert into inventory_damage_findings (batch_id, report_id, policy_id, policy_label, created_by)
  select v_batch, r.id, p.id, p.label, auth.uid()
  from inventory_damage_reports r
  join inventory_damage_policies p on p.code = 'not_deducted' and p.active
  where r.batch_id = v_batch and not r.deducted_from_location
  on conflict (report_id, policy_id) do nothing;

  return v_batch;
end $$;

-- Marca / desmarca una política incumplida en un reporte del lote.
create or replace function inventory_damage_set_finding(p_report_id uuid, p_policy_id uuid, p_failed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  p record;
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

  -- Si el departamento se quedó sin mal manejo, su correo pendiente ya no aplica.
  delete from inventory_damage_notices n
  where n.batch_id = r.batch_id and n.emailed_at is null
    and not exists (
      select 1 from inventory_damage_findings f
      join inventory_damage_reports x on x.id = f.report_id
      where f.batch_id = n.batch_id and x.origin_id = n.origin_id
    );
end $$;

-- Observación de seguimiento para un departamento con mal manejo (va en su
-- reporte y en el correo). p_emailed = true registra que se abrió el correo.
create or replace function inventory_damage_save_notice(p_batch_id uuid, p_origin_id uuid, p_note text, p_emailed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare o record;
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_batch(p_batch_id);
  select id, name, emails into o from inventory_damage_origins where id = p_origin_id;
  if o.id is null then raise exception 'Departamento no encontrado.'; end if;

  insert into inventory_damage_notices (batch_id, origin_id, origin_name, emails, note, emailed_at, emailed_by, created_by)
  values (p_batch_id, o.id, o.name, o.emails, nullif(btrim(coalesce(p_note, '')), ''),
          case when p_emailed then now() end, case when p_emailed then auth.uid() end, auth.uid())
  on conflict (batch_id, origin_id) do update set
    note = excluded.note,
    emails = excluded.emails,
    origin_name = excluded.origin_name,
    emailed_at = case when p_emailed then now() else inventory_damage_notices.emailed_at end,
    emailed_by = case when p_emailed then auth.uid() else inventory_damage_notices.emailed_by end;
end $$;

-- Observación final del lote + nº de ajuste en el sistema de la empresa (opcional).
create or replace function inventory_damage_batch_save(p_batch_id uuid, p_final_note text, p_erp_ref text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_batch(p_batch_id);
  update inventory_damage_batches
  set final_note = nullif(btrim(coalesce(p_final_note, '')), ''),
      erp_adjustment_ref = nullif(btrim(coalesce(p_erp_ref, '')), '')
  where id = p_batch_id;
end $$;

-- Confirma el lote: todo queda ACTUALIZADO. Exige que cada departamento con
-- mal manejo tenga su correo de seguimiento abierto desde NeurALE.
create or replace function inventory_damage_batch_close(p_batch_id uuid, p_final_note text, p_erp_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare v_missing text;
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_batch(p_batch_id);

  select string_agg(distinct x.origin_name, ', ') into v_missing
  from inventory_damage_findings f
  join inventory_damage_reports x on x.id = f.report_id
  left join inventory_damage_notices n on n.batch_id = f.batch_id and n.origin_id = x.origin_id
  where f.batch_id = p_batch_id and n.emailed_at is null;
  if v_missing is not null then
    raise exception 'Falta enviar el correo de seguimiento por mal manejo a: %.', v_missing;
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

-- Cancela un lote sin confirmar: sus averías vuelven a PENDIENTE.
create or replace function inventory_damage_batch_cancel(p_batch_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  perform inventory_damage_open_batch(p_batch_id);
  update inventory_damage_reports set status = 'pendiente', batch_id = null where batch_id = p_batch_id;
  delete from inventory_damage_batches where id = p_batch_id;
end $$;

-- Elimina un reporte PENDIENTE (duplicado o erróneo).
create or replace function inventory_damage_report_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare st text;
begin
  perform inventory_damage_require_manage();
  select status into st from inventory_damage_reports where id = p_id;
  if st is null then raise exception 'Reporte no encontrado.'; end if;
  if st <> 'pendiente' then raise exception 'Solo se pueden eliminar averías PENDIENTES.'; end if;
  delete from inventory_damage_reports where id = p_id;
end $$;

-- =========================================================================
-- 6. Ajustes (catálogos y QR)
-- =========================================================================
create or replace function inventory_damage_origin_save(p_id uuid, p_name text, p_emails text[], p_sort integer, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_emails text[];
begin
  perform inventory_damage_require_manage();
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Escribe el nombre del departamento.'; end if;
  select coalesce(array_agg(distinct lower(btrim(x))) filter (where btrim(x) <> ''), '{}')
    into v_emails from unnest(coalesce(p_emails, '{}')) as x;
  if exists (select 1 from unnest(v_emails) x where x !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Hay un correo con formato inválido.';
  end if;

  if p_id is null then
    insert into inventory_damage_origins (name, emails, sort_order, active, created_by)
    values (btrim(p_name), v_emails, coalesce(p_sort, 0), coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update inventory_damage_origins
    set name = btrim(p_name), emails = v_emails, sort_order = coalesce(p_sort, sort_order), active = coalesce(p_active, active)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Departamento no encontrado.'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un departamento con ese nombre.';
end $$;

create or replace function inventory_damage_origin_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  if exists (select 1 from inventory_damage_reports where origin_id = p_id)
     or exists (select 1 from inventory_damage_notices where origin_id = p_id) then
    raise exception 'Ese departamento ya tiene averías registradas: desactívalo en su lugar.';
  end if;
  delete from inventory_damage_origins where id = p_id;
end $$;

create or replace function inventory_damage_policy_save(p_id uuid, p_label text, p_description text, p_sort integer, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform inventory_damage_require_manage();
  if btrim(coalesce(p_label, '')) = '' then raise exception 'Escribe el nombre de la política.'; end if;
  if p_id is null then
    insert into inventory_damage_policies (label, description, sort_order, active, created_by)
    values (btrim(p_label), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_sort, 0), coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update inventory_damage_policies
    set label = btrim(p_label), description = nullif(btrim(coalesce(p_description, '')), ''),
        sort_order = coalesce(p_sort, sort_order), active = coalesce(p_active, active)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Política no encontrada.'; end if;
  end if;
  return v_id;
end $$;

create or replace function inventory_damage_policy_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform inventory_damage_require_manage();
  if exists (select 1 from inventory_damage_findings where policy_id = p_id) then
    raise exception 'Esa política ya se usó en averías trabajadas: desactívala en su lugar.';
  end if;
  delete from inventory_damage_policies where id = p_id;
end $$;

-- Regenera el token: el QR impreso anterior deja de funcionar.
create or replace function inventory_damage_regenerate_qr()
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  perform inventory_damage_require_manage();
  update inventory_damage_settings set qr_token = replace(gen_random_uuid()::text, '-', '') where id = 1
  returning qr_token into v;
  return v;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'inventory_damage_batch_start(uuid[])',
    'inventory_damage_set_finding(uuid, uuid, boolean)',
    'inventory_damage_save_notice(uuid, uuid, text, boolean)',
    'inventory_damage_batch_save(uuid, text, text)',
    'inventory_damage_batch_close(uuid, text, text)',
    'inventory_damage_batch_cancel(uuid)',
    'inventory_damage_report_delete(uuid)',
    'inventory_damage_origin_save(uuid, text, text[], integer, boolean)',
    'inventory_damage_origin_delete(uuid)',
    'inventory_damage_policy_save(uuid, text, text, integer, boolean)',
    'inventory_damage_policy_delete(uuid)',
    'inventory_damage_regenerate_qr()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- =========================================================================
-- 7. Realtime
-- =========================================================================
do $$
declare t text;
begin
  foreach t in array array['inventory_damage_reports', 'inventory_damage_batches', 'inventory_damage_findings', 'inventory_damage_notices'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
