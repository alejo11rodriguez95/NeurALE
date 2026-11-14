-- Storage · Auditoría OPL (operadores logísticos)
-- Chat de módulo: Storage (2026-11-14). Ver ARCHITECTURE.md → "Storage — Auditoría OPL".
--
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Requiere: 20260916120000_admin_setup.sql, 20260927180000_storage_isq.sql
-- (reutiliza storage_isq_is_manager / storage_isq_in_module / storage_isq_can_configure)
-- y 20260929150000_admin_current_access_matrix_synthesis.sql. Idempotente.
--
-- Qué hace:
--   storage_opl_operators      OPL (ej. TLA) + parametrización del Excel (hoja, títulos, mapeo de columnas)
--   storage_opl_audits         una auditoría = un Excel cargado de ese OPL
--   storage_opl_audit_lines    una fila por llave de conteo (LPN): lo esperado + conteo + reconteo
--   storage_opl_audit_extras   sobrantes: llaves físicas que no venían en el formato
--   storage_opl_sku_reviews    cierre de la Revisión de Discrepancias por SKU
--
-- Permisos (RLS real por rol, sin escritura directa: todo pasa por funciones security definer):
--   configurar OPL, cargar/cerrar/eliminar auditorías, cerrar discrepancias:
--       storage_isq_can_configure()  (admin, gerencia, jefe de Storage o nivel con "editar" en Storage)
--   contar, reconteo, registrar sobrantes:
--       cualquier usuario con acceso a Storage (storage_opl_can_count())
--   CONTEO CIEGO: quien solo cuenta no puede leer la cantidad esperada. La tabla de
--   líneas solo la leen los configuradores; los contadores usan funciones que no
--   devuelven la cantidad esperada.

-- =========================================================================
-- 0. Helpers
-- =========================================================================

create or replace function storage_opl_can_count()
returns boolean language sql security definer set search_path = public stable as $$
  select storage_isq_is_manager() or storage_isq_in_module('storage')
$$;

create or replace function storage_opl_can_manage()
returns boolean language sql security definer set search_path = public stable as $$
  select storage_isq_can_configure()
$$;

-- Nombre del usuario actual (empleado del catálogo; si no, su correo).
create or replace function storage_opl_my_name()
returns text language sql security definer set search_path = public stable as $$
  select coalesce(
    (select e.full_name from admin_users u join admin_employees e on e.id = u.employee_id
      where u.auth_user_id = auth.uid() and u.active limit 1),
    (select u.email from admin_users u where u.auth_user_id = auth.uid() limit 1),
    'Usuario'
  )
$$;

create or replace function storage_opl_norm(p text)
returns text language sql immutable as $$
  select upper(btrim(coalesce(p, '')))
$$;

grant execute on function storage_opl_can_count() to authenticated;
grant execute on function storage_opl_can_manage() to authenticated;

-- =========================================================================
-- 1. Tablas
-- =========================================================================

create table if not exists storage_opl_operators (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  sheet_name text,                                  -- hoja del Excel modelo
  header_row int not null default 1,                -- fila de títulos (1 = primera)
  headers text[] not null default '{}',             -- títulos detectados en el modelo
  mapping jsonb not null default '{}'::jsonb,       -- { key, key_label, sku, description, qty, location, extras[] }
  sample_file_name text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create unique index if not exists storage_opl_operators_name_uidx on storage_opl_operators (lower(name));

create table if not exists storage_opl_audits (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references storage_opl_operators(id) on delete restrict,
  folio text not null,
  status text not null default 'cargando' check (status in ('cargando', 'en_curso', 'cerrada')),
  file_name text,
  sheet_name text,
  mapping jsonb not null default '{}'::jsonb,       -- copia del mapeo usado
  note text,
  line_count int not null default 0,
  sku_count int not null default 0,
  expected_total numeric not null default 0,
  counted_lines int not null default 0,             -- se mantienen al contar (para avance y Realtime)
  counted_units numeric not null default 0,
  extra_count int not null default 0,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  closed_by_name text,
  close_note text
);
create unique index if not exists storage_opl_audits_folio_uidx on storage_opl_audits (folio);
create index if not exists storage_opl_audits_operator_idx on storage_opl_audits (operator_id, created_at desc);

create table if not exists storage_opl_audit_lines (
  id bigserial primary key,
  audit_id uuid not null references storage_opl_audits(id) on delete cascade,
  line_no int,
  key_value text not null,
  key_norm text not null,
  sku text not null,
  description text,
  location text,
  expected_qty numeric not null default 0,
  extra jsonb not null default '{}'::jsonb,
  counted_qty numeric,
  counted_by uuid references auth.users(id),
  counted_by_name text,
  counted_at timestamptz,
  recount_qty numeric,
  recount_by uuid references auth.users(id),
  recount_by_name text,
  recount_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid()
);
create unique index if not exists storage_opl_audit_lines_key_uidx on storage_opl_audit_lines (audit_id, key_norm);
create index if not exists storage_opl_audit_lines_sku_idx on storage_opl_audit_lines (audit_id, sku);

create table if not exists storage_opl_audit_extras (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references storage_opl_audits(id) on delete cascade,
  key_value text not null,
  key_norm text not null,
  sku text not null,
  description text,
  location text,
  qty numeric not null check (qty >= 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  created_by_name text
);
create unique index if not exists storage_opl_audit_extras_key_uidx on storage_opl_audit_extras (audit_id, key_norm);

create table if not exists storage_opl_sku_reviews (
  audit_id uuid not null references storage_opl_audits(id) on delete cascade,
  sku text not null,
  status text not null default 'reconteo' check (status in ('reconteo', 'cuadrado', 'diferencia_confirmada')),
  note text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  closed_by_name text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  primary key (audit_id, sku)
);

-- =========================================================================
-- 2. RLS — lectura; sin políticas de escritura (todo por funciones)
-- =========================================================================

alter table storage_opl_operators enable row level security;
alter table storage_opl_audits enable row level security;
alter table storage_opl_audit_lines enable row level security;
alter table storage_opl_audit_extras enable row level security;
alter table storage_opl_sku_reviews enable row level security;

drop policy if exists "sopo_select" on storage_opl_operators;
create policy "sopo_select" on storage_opl_operators for select using (storage_opl_can_count());
drop policy if exists "sopa_select" on storage_opl_audits;
create policy "sopa_select" on storage_opl_audits for select using (storage_opl_can_count());
-- Conteo ciego: las líneas (con la cantidad esperada) solo las leen los configuradores.
drop policy if exists "sopl_select" on storage_opl_audit_lines;
create policy "sopl_select" on storage_opl_audit_lines for select using (storage_opl_can_manage());
drop policy if exists "sope_select" on storage_opl_audit_extras;
create policy "sope_select" on storage_opl_audit_extras for select using (storage_opl_can_count());
drop policy if exists "sopr_select" on storage_opl_sku_reviews;
create policy "sopr_select" on storage_opl_sku_reviews for select using (storage_opl_can_count());

-- =========================================================================
-- 3. OPL (parametrización)
-- =========================================================================

create or replace function storage_opl_operator_save(
  p_id uuid, p_name text, p_sheet text, p_header_row int, p_headers text[],
  p_mapping jsonb, p_sample_file text, p_active boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not storage_opl_can_manage() then raise exception 'Solo el jefe de Storage, gerencia o admin pueden configurar OPL.'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Ponle nombre al OPL.'; end if;
  if coalesce(p_mapping->>'key', '') = '' or coalesce(p_mapping->>'sku', '') = ''
     or coalesce(p_mapping->>'description', '') = '' or coalesce(p_mapping->>'qty', '') = '' then
    raise exception 'Falta mapear la llave de conteo, SKU, Descripción o Cantidad.';
  end if;
  if p_id is null then
    insert into storage_opl_operators (name, sheet_name, header_row, headers, mapping, sample_file_name, active)
    values (btrim(p_name), p_sheet, greatest(coalesce(p_header_row, 1), 1), coalesce(p_headers, '{}'), p_mapping, p_sample_file, coalesce(p_active, true))
    returning id into v_id;
  else
    update storage_opl_operators set
      name = btrim(p_name), sheet_name = p_sheet, header_row = greatest(coalesce(p_header_row, 1), 1),
      headers = coalesce(p_headers, '{}'), mapping = p_mapping,
      sample_file_name = coalesce(p_sample_file, sample_file_name), active = coalesce(p_active, active),
      updated_at = now(), updated_by = auth.uid()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'OPL no encontrado.'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un OPL con ese nombre.';
end $$;

create or replace function storage_opl_operator_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_opl_can_manage() then raise exception 'Sin permiso.'; end if;
  if exists (select 1 from storage_opl_audits where operator_id = p_id) then
    raise exception 'Este OPL ya tiene auditorías: desactívalo en su lugar.';
  end if;
  delete from storage_opl_operators where id = p_id;
end $$;

-- =========================================================================
-- 4. Auditorías (carga del Excel en partes)
-- =========================================================================

create or replace function storage_opl_audit_create(p_operator uuid, p_file_name text, p_sheet text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_op storage_opl_operators; v_id uuid; v_n int; v_folio text;
begin
  if not storage_opl_can_manage() then raise exception 'Solo el jefe de Storage, gerencia o admin pueden cargar auditorías.'; end if;
  select * into v_op from storage_opl_operators where id = p_operator and active;
  if v_op.id is null then raise exception 'OPL no encontrado o inactivo.'; end if;
  -- Limpia cargas que quedaron a medias (más de 1 hora).
  delete from storage_opl_audits where operator_id = p_operator and status = 'cargando' and created_at < now() - interval '1 hour';
  select count(*) + 1 into v_n from storage_opl_audits a where a.operator_id = p_operator;
  loop
    v_folio := upper(regexp_replace(v_op.name, '[^A-Za-z0-9]+', '', 'g')) || '-' || lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from storage_opl_audits where folio = v_folio);
    v_n := v_n + 1;
  end loop;
  insert into storage_opl_audits (operator_id, folio, file_name, sheet_name, mapping, note, created_by_name)
  values (p_operator, v_folio, p_file_name, p_sheet, v_op.mapping, nullif(btrim(coalesce(p_note, '')), ''), storage_opl_my_name())
  returning id into v_id;
  return v_id;
end $$;

-- p_lines: [{ n, k, s, d, l, q, x }]  (línea, llave, sku, descripción, ubicación, cantidad, extras)
create or replace function storage_opl_audit_add_lines(p_audit uuid, p_lines jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_status text; v_dup text; v_n int;
begin
  if not storage_opl_can_manage() then raise exception 'Sin permiso.'; end if;
  select status into v_status from storage_opl_audits where id = p_audit;
  if v_status is distinct from 'cargando' then raise exception 'La auditoría ya no está en carga.'; end if;
  insert into storage_opl_audit_lines (audit_id, line_no, key_value, key_norm, sku, description, location, expected_qty, extra)
  select p_audit, (e->>'n')::int, btrim(e->>'k'), storage_opl_norm(e->>'k'), btrim(e->>'s'),
         nullif(btrim(coalesce(e->>'d', '')), ''), nullif(btrim(coalesce(e->>'l', '')), ''),
         coalesce((e->>'q')::numeric, 0), coalesce(e->'x', '{}'::jsonb)
  from jsonb_array_elements(p_lines) e;
  get diagnostics v_n = row_count;
  return v_n;
exception when unique_violation then
  raise exception 'La llave de conteo se repite en el archivo: cada valor (ej. cada LPN) debe aparecer una sola vez.';
end $$;

create or replace function storage_opl_audit_finalize(p_audit uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_opl_can_manage() then raise exception 'Sin permiso.'; end if;
  update storage_opl_audits a set
    status = 'en_curso',
    line_count = s.n, sku_count = s.skus, expected_total = s.total, last_activity_at = now()
  from (select count(*) n, count(distinct sku) skus, coalesce(sum(expected_qty), 0) total
        from storage_opl_audit_lines where audit_id = p_audit) s
  where a.id = p_audit and a.status = 'cargando';
  if not found then raise exception 'La auditoría no está en carga.'; end if;
  if (select line_count from storage_opl_audits where id = p_audit) = 0 then
    raise exception 'El archivo no trae líneas válidas.';
  end if;
end $$;

create or replace function storage_opl_audit_close(p_audit uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_opl_can_manage() then raise exception 'Solo el jefe de Storage, gerencia o admin pueden cerrar la auditoría.'; end if;
  update storage_opl_audits set status = 'cerrada', closed_at = now(), closed_by = auth.uid(),
    closed_by_name = storage_opl_my_name(), close_note = nullif(btrim(coalesce(p_note, '')), ''), last_activity_at = now()
  where id = p_audit and status = 'en_curso';
  if not found then raise exception 'La auditoría no está en curso.'; end if;
end $$;

create or replace function storage_opl_audit_reopen(p_audit uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_opl_can_manage() then raise exception 'Sin permiso.'; end if;
  update storage_opl_audits set status = 'en_curso', closed_at = null, closed_by = null, closed_by_name = null, last_activity_at = now()
  where id = p_audit and status = 'cerrada';
  if not found then raise exception 'La auditoría no está cerrada.'; end if;
end $$;

create or replace function storage_opl_audit_delete(p_audit uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_opl_can_manage() then raise exception 'Sin permiso.'; end if;
  delete from storage_opl_audits where id = p_audit;
end $$;

-- Recalcula el avance que ven todos (y dispara Realtime en storage_opl_audits).
create or replace function storage_opl_touch(p_audit uuid)
returns void language sql security definer set search_path = public as $$
  update storage_opl_audits a set
    counted_lines = (select count(*) from storage_opl_audit_lines l where l.audit_id = p_audit and l.counted_qty is not null),
    counted_units = (select coalesce(sum(coalesce(l.recount_qty, l.counted_qty)), 0) from storage_opl_audit_lines l where l.audit_id = p_audit)
                  + (select coalesce(sum(x.qty), 0) from storage_opl_audit_extras x where x.audit_id = p_audit),
    extra_count = (select count(*) from storage_opl_audit_extras x where x.audit_id = p_audit),
    last_activity_at = now()
  where a.id = p_audit
$$;

-- =========================================================================
-- 5. Conteo (ciego)
-- =========================================================================

-- Busca una llave sin revelar la cantidad esperada.
create or replace function storage_opl_lookup(p_audit uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public stable as $$
declare l storage_opl_audit_lines; x storage_opl_audit_extras; v_status text; v_review text;
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  select status into v_status from storage_opl_audits where id = p_audit;
  if v_status is null then raise exception 'Auditoría no encontrada.'; end if;
  select * into l from storage_opl_audit_lines where audit_id = p_audit and key_norm = storage_opl_norm(p_key);
  if l.id is not null then
    select status into v_review from storage_opl_sku_reviews where audit_id = p_audit and sku = l.sku;
    return jsonb_build_object(
      'found', true, 'key', l.key_value, 'sku', l.sku, 'description', l.description, 'location', l.location,
      'extra', l.extra, 'counted', l.counted_qty is not null, 'counted_by', l.counted_by_name, 'counted_at', l.counted_at,
      'mine', l.counted_by = auth.uid(), 'review', v_review, 'audit_status', v_status,
      -- La cantidad propia sí se devuelve (para corregir), la esperada nunca.
      'my_qty', case when l.counted_by = auth.uid() or storage_opl_can_manage() then l.counted_qty end);
  end if;
  select * into x from storage_opl_audit_extras where audit_id = p_audit and key_norm = storage_opl_norm(p_key);
  if x.id is not null then
    return jsonb_build_object('found', false, 'extra_registered', true, 'key', x.key_value, 'sku', x.sku,
      'qty', x.qty, 'location', x.location, 'by', x.created_by_name, 'audit_status', v_status);
  end if;
  return jsonb_build_object('found', false, 'extra_registered', false, 'key', btrim(p_key), 'audit_status', v_status);
end $$;

create or replace function storage_opl_count(p_audit uuid, p_key text, p_qty numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l storage_opl_audit_lines; v_status text;
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso para contar.'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Cantidad inválida.'; end if;
  select status into v_status from storage_opl_audits where id = p_audit;
  if v_status is distinct from 'en_curso' then raise exception 'La auditoría no está en curso.'; end if;
  -- Bloquea la línea: si dos personas confirman el mismo LPN a la vez, gana la primera.
  select * into l from storage_opl_audit_lines where audit_id = p_audit and key_norm = storage_opl_norm(p_key) for update;
  if l.id is null then raise exception 'Esa llave no está en el formato. Regístrala como sobrante.'; end if;
  if l.counted_qty is not null then
    return jsonb_build_object('ok', false, 'reason', 'ya_contado', 'counted_by', l.counted_by_name, 'counted_at', l.counted_at);
  end if;
  update storage_opl_audit_lines set counted_qty = p_qty, counted_by = auth.uid(),
    counted_by_name = storage_opl_my_name(), counted_at = now()
  where id = l.id;
  perform storage_opl_touch(p_audit);
  return jsonb_build_object('ok', true, 'sku', l.sku);
end $$;

-- Deshacer un conteo (quien contó o un configurador), mientras el SKU no esté en revisión cerrada.
create or replace function storage_opl_count_undo(p_audit uuid, p_key text)
returns void language plpgsql security definer set search_path = public as $$
declare l storage_opl_audit_lines; v_status text; v_review text;
begin
  select status into v_status from storage_opl_audits where id = p_audit;
  if v_status is distinct from 'en_curso' then raise exception 'La auditoría no está en curso.'; end if;
  select * into l from storage_opl_audit_lines where audit_id = p_audit and key_norm = storage_opl_norm(p_key) for update;
  if l.id is null or l.counted_qty is null then raise exception 'Esa llave no está contada.'; end if;
  if not (storage_opl_can_manage() or (storage_opl_can_count() and l.counted_by = auth.uid())) then
    raise exception 'Solo quien lo contó o el jefe de Storage pueden deshacer este conteo.';
  end if;
  select status into v_review from storage_opl_sku_reviews where audit_id = p_audit and sku = l.sku;
  if v_review in ('cuadrado', 'diferencia_confirmada') then raise exception 'Ese SKU ya se cerró en Revisión de Discrepancias.'; end if;
  update storage_opl_audit_lines set counted_qty = null, counted_by = null, counted_by_name = null, counted_at = null,
    recount_qty = null, recount_by = null, recount_by_name = null, recount_at = null
  where id = l.id;
  perform storage_opl_touch(p_audit);
end $$;

-- Sobrante: llave física que no está en el formato.
create or replace function storage_opl_extra_register(
  p_audit uuid, p_key text, p_sku text, p_description text, p_location text, p_qty numeric, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_status text; v_desc text;
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  select status into v_status from storage_opl_audits where id = p_audit;
  if v_status is distinct from 'en_curso' then raise exception 'La auditoría no está en curso.'; end if;
  if btrim(coalesce(p_key, '')) = '' or btrim(coalesce(p_sku, '')) = '' then raise exception 'Falta la llave o el SKU.'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Cantidad inválida.'; end if;
  if exists (select 1 from storage_opl_audit_lines where audit_id = p_audit and key_norm = storage_opl_norm(p_key)) then
    raise exception 'Esa llave sí está en el formato: cuéntala normal.';
  end if;
  if exists (select 1 from storage_opl_sku_reviews where audit_id = p_audit and sku = btrim(p_sku) and status <> 'reconteo') then
    raise exception 'Ese SKU ya se cerró en Revisión de Discrepancias.';
  end if;
  select description into v_desc from storage_opl_audit_lines where audit_id = p_audit and sku = btrim(p_sku) limit 1;
  insert into storage_opl_audit_extras (audit_id, key_value, key_norm, sku, description, location, qty, note, created_by_name)
  values (p_audit, btrim(p_key), storage_opl_norm(p_key), btrim(p_sku), coalesce(nullif(btrim(coalesce(p_description, '')), ''), v_desc),
          nullif(btrim(coalesce(p_location, '')), ''), p_qty, nullif(btrim(coalesce(p_note, '')), ''), storage_opl_my_name());
  perform storage_opl_touch(p_audit);
exception when unique_violation then
  raise exception 'Ese sobrante ya fue registrado.';
end $$;

create or replace function storage_opl_extra_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare x storage_opl_audit_extras; v_status text;
begin
  select * into x from storage_opl_audit_extras where id = p_id;
  if x.id is null then raise exception 'Sobrante no encontrado.'; end if;
  if not (storage_opl_can_manage() or (storage_opl_can_count() and x.created_by = auth.uid())) then
    raise exception 'Solo quien lo registró o el jefe de Storage pueden eliminarlo.';
  end if;
  select status into v_status from storage_opl_audits where id = x.audit_id;
  if v_status is distinct from 'en_curso' then raise exception 'La auditoría no está en curso.'; end if;
  delete from storage_opl_audit_extras where id = p_id;
  perform storage_opl_touch(x.audit_id);
end $$;

-- =========================================================================
-- 6. Avance y discrepancias (sin cantidades esperadas para quien solo cuenta)
-- =========================================================================

create or replace function storage_opl_sku_summary(p_audit uuid)
returns table (
  sku text, description text, lines_total int, lines_counted int, lines_recounted int,
  expected numeric, counted numeric, final_qty numeric, extra_qty numeric, extra_lines int,
  complete boolean, discrepancy boolean, review_status text, review_note text, review_closed_by text, review_closed_at timestamptz
) language plpgsql security definer set search_path = public stable as $$
declare v_manage boolean := storage_opl_can_manage(); v_closed boolean;
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  select status = 'cerrada' into v_closed from storage_opl_audits where id = p_audit;
  return query
  with ls as (
    select l.sku, max(l.description) description, count(*)::int n, count(l.counted_qty)::int nc, count(l.recount_qty)::int nr,
           sum(l.expected_qty) exp, coalesce(sum(l.counted_qty), 0) cnt, coalesce(sum(coalesce(l.recount_qty, l.counted_qty)), 0) fin
    from storage_opl_audit_lines l where l.audit_id = p_audit group by l.sku
  ), xs as (
    select x.sku, max(x.description) description, coalesce(sum(x.qty), 0) q, count(*)::int n
    from storage_opl_audit_extras x where x.audit_id = p_audit group by x.sku
  ), j as (
    select coalesce(ls.sku, xs.sku) sku, coalesce(ls.description, xs.description) description,
           coalesce(ls.n, 0) n, coalesce(ls.nc, 0) nc, coalesce(ls.nr, 0) nr,
           coalesce(ls.exp, 0) exp, coalesce(ls.cnt, 0) cnt, coalesce(ls.fin, 0) fin,
           coalesce(xs.q, 0) xq, coalesce(xs.n, 0) xn
    from ls full join xs on xs.sku = ls.sku
  )
  select j.sku, j.description, j.n, j.nc, j.nr,
         case when v_manage then j.exp end,
         case when v_manage then j.cnt + j.xq end,
         case when v_manage then j.fin + j.xq end,
         j.xq, j.xn,
         (j.nc = j.n) as complete,
         ((j.nc = j.n or coalesce(v_closed, false)) and (j.fin + j.xq) <> j.exp) or r.sku is not null as discrepancy,
         r.status, r.note, r.closed_by_name, r.closed_at
  from j left join storage_opl_sku_reviews r on r.audit_id = p_audit and r.sku = j.sku
  order by j.sku;
end $$;

-- Llaves de un SKU para el reconteo (sin cantidades para quien solo cuenta).
create or replace function storage_opl_sku_lines(p_audit uuid, p_sku text)
returns table (
  key_value text, location text, extra jsonb, expected numeric, counted numeric, counted_by text,
  recount numeric, recount_by text, recount_mine boolean, recounted boolean, is_extra boolean, extra_id uuid
) language plpgsql security definer set search_path = public stable as $$
declare v_manage boolean := storage_opl_can_manage();
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  return query
  select l.key_value, l.location, l.extra,
         case when v_manage then l.expected_qty end,
         case when v_manage then l.counted_qty end, l.counted_by_name,
         case when v_manage or l.recount_by = auth.uid() then l.recount_qty end, l.recount_by_name,
         l.recount_by = auth.uid(), l.recount_qty is not null, false, null::uuid
  from storage_opl_audit_lines l where l.audit_id = p_audit and l.sku = p_sku
  union all
  select x.key_value, x.location, '{}'::jsonb, case when v_manage then 0::numeric end, x.qty, x.created_by_name,
         null, null, false, true, true, x.id
  from storage_opl_audit_extras x where x.audit_id = p_audit and x.sku = p_sku
  order by 11, 2, 1;
end $$;

create or replace function storage_opl_recount(p_audit uuid, p_key text, p_qty numeric)
returns void language plpgsql security definer set search_path = public as $$
declare l storage_opl_audit_lines; v_status text; v_review text;
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Cantidad inválida.'; end if;
  select status into v_status from storage_opl_audits where id = p_audit;
  if v_status = 'cargando' or v_status is null then raise exception 'Auditoría no disponible.'; end if;
  select * into l from storage_opl_audit_lines where audit_id = p_audit and key_norm = storage_opl_norm(p_key) for update;
  if l.id is null then raise exception 'Esa llave no está en el formato.'; end if;
  select status into v_review from storage_opl_sku_reviews where audit_id = p_audit and sku = l.sku;
  if v_review in ('cuadrado', 'diferencia_confirmada') then raise exception 'Ese SKU ya se cerró.'; end if;
  if v_review is null then
    insert into storage_opl_sku_reviews (audit_id, sku) values (p_audit, l.sku) on conflict do nothing;
  end if;
  update storage_opl_audit_lines set recount_qty = p_qty, recount_by = auth.uid(), recount_by_name = storage_opl_my_name(), recount_at = now()
  where id = l.id;
  perform storage_opl_touch(p_audit);
end $$;

create or replace function storage_opl_review_close(p_audit uuid, p_sku text, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_opl_can_manage() then raise exception 'Solo el jefe de Storage, gerencia o admin pueden cerrar una discrepancia.'; end if;
  if p_status not in ('cuadrado', 'diferencia_confirmada') then raise exception 'Estado inválido.'; end if;
  if p_status = 'diferencia_confirmada' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Escribe una nota para confirmar la diferencia.';
  end if;
  insert into storage_opl_sku_reviews (audit_id, sku, status, note, closed_at, closed_by, closed_by_name)
  values (p_audit, p_sku, p_status, nullif(btrim(coalesce(p_note, '')), ''), now(), auth.uid(), storage_opl_my_name())
  on conflict (audit_id, sku) do update set status = excluded.status, note = excluded.note,
    closed_at = excluded.closed_at, closed_by = excluded.closed_by, closed_by_name = excluded.closed_by_name;
  perform storage_opl_touch(p_audit);
end $$;

create or replace function storage_opl_review_reopen(p_audit uuid, p_sku text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not storage_opl_can_manage() then raise exception 'Sin permiso.'; end if;
  update storage_opl_sku_reviews set status = 'reconteo', closed_at = null, closed_by = null, closed_by_name = null
  where audit_id = p_audit and sku = p_sku;
  perform storage_opl_touch(p_audit);
end $$;

-- Conteos por persona (avance por contador).
create or replace function storage_opl_counters(p_audit uuid)
returns table (name text, lines int, units numeric, recounts int, extras int, last_at timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  return query
  with c as (
    select counted_by_name n, 1 l, counted_qty u, 0 r, 0 x, counted_at t from storage_opl_audit_lines where audit_id = p_audit and counted_qty is not null
    union all
    select recount_by_name, 0, 0, 1, 0, recount_at from storage_opl_audit_lines where audit_id = p_audit and recount_qty is not null
    union all
    select created_by_name, 0, qty, 0, 1, created_at from storage_opl_audit_extras where audit_id = p_audit
  )
  select coalesce(c.n, '—'), sum(c.l)::int, sum(c.u), sum(c.r)::int, sum(c.x)::int, max(c.t)
  from c group by c.n order by 2 desc, 1;
end $$;

-- Mis últimos conteos (para corregir rápido en el celular).
create or replace function storage_opl_my_counts(p_audit uuid, p_limit int default 15)
returns table (key_value text, sku text, description text, location text, qty numeric, counted_at timestamptz)
language plpgsql security definer set search_path = public stable as $$
begin
  if not storage_opl_can_count() then raise exception 'Sin permiso.'; end if;
  return query
  select l.key_value, l.sku, l.description, l.location, l.counted_qty, l.counted_at
  from storage_opl_audit_lines l
  where l.audit_id = p_audit and l.counted_by = auth.uid() and l.counted_qty is not null
  order by l.counted_at desc limit greatest(coalesce(p_limit, 15), 1);
end $$;

-- Permisos de ejecución (las funciones validan rol por dentro).
do $$
declare f text;
begin
  foreach f in array array[
    'storage_opl_operator_save(uuid,text,text,int,text[],jsonb,text,boolean)', 'storage_opl_operator_delete(uuid)',
    'storage_opl_audit_create(uuid,text,text,text)', 'storage_opl_audit_add_lines(uuid,jsonb)', 'storage_opl_audit_finalize(uuid)',
    'storage_opl_audit_close(uuid,text)', 'storage_opl_audit_reopen(uuid)', 'storage_opl_audit_delete(uuid)',
    'storage_opl_lookup(uuid,text)', 'storage_opl_count(uuid,text,numeric)', 'storage_opl_count_undo(uuid,text)',
    'storage_opl_extra_register(uuid,text,text,text,text,numeric,text)', 'storage_opl_extra_delete(uuid)',
    'storage_opl_sku_summary(uuid)', 'storage_opl_sku_lines(uuid,text)', 'storage_opl_recount(uuid,text,numeric)',
    'storage_opl_review_close(uuid,text,text,text)', 'storage_opl_review_reopen(uuid,text)',
    'storage_opl_counters(uuid)', 'storage_opl_my_counts(uuid,int)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function storage_opl_touch(uuid) from public;

-- =========================================================================
-- 7. Realtime: el avance se refresca solo (audits cambia en cada conteo)
-- =========================================================================

do $$
declare t text;
begin
  foreach t in array array['storage_opl_audits', 'storage_opl_sku_reviews', 'storage_opl_audit_extras'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
