# Entrega Storage · ISQ (Inbound-Storage Quality) — 2026-09-27

Base: repo clonado en el commit `02870ee` (2026-09-27 16:13). Build (`tsc -b && vite build`) y `oxlint` OK sobre ese árbol.

## Orden para subir
1. **Supabase → SQL Editor:** correr `supabase/migrations/20260927180000_storage_isq.sql` (idempotente; probado en Postgres 16 con las políticas por rol).
2. **GitHub:** subir los archivos del zip respetando las rutas. No borra nada; no quedan archivos huérfanos.

> Si se sube el código antes de correr el SQL, no se rompe nada: el Diálogo Táctico muestra "ISQ — Sin lectura" y las pantallas de ISQ dan error de tabla hasta que se corra la migración.

## Archivos
Nuevos:
- `supabase/migrations/20260927180000_storage_isq.sql`
- `src/modules/storage/isq/lib/isq.ts` — datos, fechas y turnos (hora SV)
- `src/modules/storage/isq/ui.tsx` — permisos de interfaz, chips, rango de fechas, hook en vivo
- `src/modules/storage/isq/IsqReportView.tsx` — Storage → ISQ (formulario + reportadas hoy)
- `src/modules/storage/isq/IsqDashboard.tsx` — Dash Storage (también usado por el Dashboard Neuronal)
- `src/modules/storage/isq/IsqSettingsView.tsx` — Ajustes de Storage → ISQ
- `src/modules/storage/isq/IsqFollowUpView.tsx` — Inbound → ISQ (seguimiento)

Modificados:
- `src/modules/storage/index.tsx` — tarjetas ISQ, Dash Storage, Ajustes (se conserva Diálogo Táctico)
- `src/modules/inbound/index.tsx` — tarjeta ISQ (se conserva Diálogo Táctico)
- `src/modules/dashboard/index.tsx`, `DashboardHome.tsx` — tarjeta "ISQ · Inbound-Storage" (`?view=isq`)
- `src/modules/dashboard/tactical/config.ts`, `api.ts`, `metrics.ts`, `TacticalBoard.tsx`, `TacticalCaptureView.tsx`, `dialogs.tsx` — Calidad de Inbound dividida en "Dif. OC" + "ISQ"

## Texto para agregar a ARCHITECTURE.md (cuando esté subido y corrido)

**Estado de módulos → Storage:** En progreso. Opciones en `src/modules/storage/index.tsx` (`?view=`): **Inbound-Storage Quality (ISQ)** (`isq`), **Dash Storage** (`dash`), **Diálogo Táctico** (sin cambios), **Ajustes de Storage** (`ajustes` → `ajustes-isq`; solo jefe_area de storage, gerencia, admin). Todo el código de ISQ vive en `src/modules/storage/isq/`. Decisión 2026-09-27: Storage en NeurALE es **control operativo** (trazabilidad y productividad); el stock oficial sigue en el WMS/vERP — NeurALE no lleva saldos por ubicación. Codificación de ubicaciones: picking `Prefijo-Pasillo-Lado-Rack-Nivel`, almacenamiento `Prefijo-Pasillo-Lado-Rack-Nivel-LadoTarima-T` (pendiente foto de etiquetas para cerrar el formato).

**Estado de módulos → Inbound:** el chat de Storage le agregó la tarjeta **"ISQ · Inbound-Storage Quality"** (`?view=isq`, vista en `src/modules/storage/isq/IsqFollowUpView.tsx`): bandeja de seguimiento de las incidencias ISQ (responsable del catálogo de Empleados, estado Abierta → En seguimiento → Corregida / No procede, causa raíz, acción correctiva, notas, antigüedad con alerta > 48 h). No reemplazar ni quitar esa tarjeta.

**Estado de módulos → Dashboard Neuronal:** el chat de Storage le agregó la tarjeta **"ISQ · Inbound-Storage"** (`?view=isq`), que reutiliza `IsqDashboard` de Storage con el color de Storage.

**Diálogo Táctico → Inbound (v7, excepción 2026-09-27 hecha por el chat de Storage, acordada con Josué; el chat del Dashboard ya estaba cerrado):** la Calidad de Inbound se divide en dos cuadros, igual que Volumen: **Dif. OC** (manual, `dashboard_tactical_process.errors`, como antes) e **ISQ** (automático: conteo de `storage_isq_incidents` con `reported_at` dentro del turno — A 06–14 h, B 14–22 h, hora SV; los reportes de 22–06 h no caen en ningún turno). Meta propia `goals.g.isqMax` (0 por defecto, editable en Metas; no requirió SQL, `normalizeGoals` la completa). Cada cuadro lleva su semáforo y ambos cuentan en "% indicadores en meta". El tablero se suscribe también a `storage_isq_incidents` (Realtime). Historial/CSV agrega la columna "Inbound ISQ". Cambios en `config.ts` (`ProcessDef.isq`, `g.isqMax`), `api.ts` (`TacticalData.isq`, usa `countIsqInShift`/`countIsqByShift` de Storage), `metrics.ts` (`s.isq`), `TacticalBoard.tsx`, `TacticalCaptureView.tsx` (vista previa de ISQ en Inbound, solo lectura) y `dialogs.tsx`. Sin tablas `dashboard_*` nuevas.

**Quién llena qué → nueva fila:** "ISQ" (Calidad de la fila Inbound) | Automático desde Storage → ISQ | cualquier usuario de Storage (+ gerencia/admin) reporta.

**Supabase → Tablas creadas (Storage — ISQ, 2026-09-27):** migración `supabase/migrations/20260927180000_storage_isq.sql`. **RLS real por rol desde el inicio** (no permisiva), con helpers `storage_isq_is_manager()`, `storage_isq_in_module(m)`, `storage_isq_can_configure()`, `storage_isq_is_user()` sobre `admin_current_access()`.
- `storage_isq_incidents` — reporte (sku, reference = No. de recepción/OC, stower_employee_id + copia stower_name, type_id + copia type_label, extra jsonb `[{field_id,label,value}]`) + seguimiento (status `abierta/en_seguimiento/corregida/no_procede`, responsible_employee_id + responsible_name, root_cause `recepcion/proveedor/transporte/almacenaje/otra`, corrective_action, followup_notes, closed_at/closed_by automáticos). Trigger de insert fija `reported_at`, `report_date` (hoy SV), `created_by` y estado inicial; trigger de update impide que Inbound cambie los datos del reporte. Lee: gerencia/admin + usuarios de storage e inbound. Inserta: gerencia/admin + storage. Actualiza: gerencia/admin, jefe de storage, usuarios de inbound. Borra: gerencia/admin, jefe de storage. En `supabase_realtime`.
- `storage_isq_types` — catálogo de tipos (11 sembrados), `storage_isq_fields` — campos extra (texto/número/fecha/lista, obligatorio, orden, activo), `storage_isq_settings` — fila única con `reporter_positions` (puestos que alimentan "Almacenador", default `{Almacenador}`). Lectura: cualquier usuario activo; escritura: jefe de storage, gerencia, admin.

**Convenciones → OptionCard:** Storage e Inbound usan el `OptionCard` de `src/modules/dashboard/components/` para no crear una quinta copia; los formularios de ISQ usan `formStyles` de Outbound (mismo precedente que Picking). Sigue pendiente promover ambos a `src/shared/components/`.
