-- Dashboard Neuronal · Diálogo Táctico — indicadores de calidad cruzados
-- Chat de módulo: Dashboard Neuronal (ver ARCHITECTURE.md → "Diálogo Táctico CD Nneo")
--
-- REQUIERE haber corrido antes 20260926120000_dashboard_tactical_dialogue.sql.
-- Cómo aplicar: pega este archivo completo en Supabase → SQL Editor → Run.
-- Es idempotente (se puede volver a correr).
--
-- Algunos indicadores de "Calidad" del diálogo NO los llena el módulo dueño
-- de la fila, sino otro módulo que los audita:
--
--   metric                      fila del tablero   lo llena
--   pic_rejections              Picking            Outbound  (rechazos a Picking;
--                                                  luego será automático desde
--                                                  Control de Calidad)
--   alm_wrong_locations         Storage            Inventory (ubicaciones erróneas)
--   des_branch_inconsistencies  Outbound           Inventory (inconsistencias en sucursales)
--
-- La columna `errors` de dashboard_tactical_process queda solo para Inbound
-- (diferencias vs. OC); para Storage, Picking y Outbound se ignora.

create or replace function dashboard_quality_module(p_metric text)
returns text
language sql
immutable
as $$
  select case p_metric
    when 'pic_rejections' then 'outbound'
    when 'alm_wrong_locations' then 'inventory'
    when 'des_branch_inconsistencies' then 'inventory'
  end
$$;

create table if not exists dashboard_tactical_quality (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid(),

  shift_date date not null,
  shift text not null check (shift in ('A', 'B')),
  metric text not null check (metric in (
    'pic_rejections',
    'alm_wrong_locations',
    'des_branch_inconsistencies'
  )),
  value numeric check (value is null or value >= 0),

  unique (shift_date, shift, metric)
);

drop trigger if exists dashboard_tactical_quality_touch on dashboard_tactical_quality;
create trigger dashboard_tactical_quality_touch
  before insert or update on dashboard_tactical_quality
  for each row execute function dashboard_touch();

alter table dashboard_tactical_quality enable row level security;

drop policy if exists "dtq_select" on dashboard_tactical_quality;
create policy "dtq_select" on dashboard_tactical_quality
  for select using (dashboard_can_read_tactical());

drop policy if exists "dtq_insert" on dashboard_tactical_quality;
create policy "dtq_insert" on dashboard_tactical_quality
  for insert with check (
    dashboard_is_manager() or dashboard_is_area_lead(dashboard_quality_module(metric))
  );

drop policy if exists "dtq_update" on dashboard_tactical_quality;
create policy "dtq_update" on dashboard_tactical_quality
  for update
  using (dashboard_is_manager() or dashboard_is_area_lead(dashboard_quality_module(metric)))
  with check (dashboard_is_manager() or dashboard_is_area_lead(dashboard_quality_module(metric)));

-- Tiempo real
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'dashboard_tactical_quality'
  ) then
    alter publication supabase_realtime add table dashboard_tactical_quality;
  end if;
end $$;

-- Metas: Inbound pasa a medirse en contenedores + pallets aprox. por contenedor.
-- (Solo ajusta la unidad de Inbound y agrega palletsPerContainer si faltan;
-- no pisa metas que el gerente ya haya cambiado.)
update dashboard_tactical_settings
set goals = jsonb_set(
  jsonb_set(
    goals,
    '{g,palletsPerContainer}',
    coalesce(goals #> '{g,palletsPerContainer}', '45'::jsonb),
    true
  ),
  '{procesos}',
  coalesce(
    (
      select jsonb_agg(
        case when p->>'id' = 'rec' then p || '{"unidad":"contenedores"}'::jsonb else p end
      )
      from jsonb_array_elements(goals->'procesos') p
    ),
    '[]'::jsonb
  )
)
where id = 1 and goals ? 'procesos' and goals ? 'g';
