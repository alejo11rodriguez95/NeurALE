import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { addDaysISO, formatDateTimeSV, todaySV } from '@/modules/storage/isq/lib/isq'
import { GlassCard } from '@/shared/components/GlassCard'
import { withAlpha } from '@/shared/modules'

import { DamageBatchView } from './DamageBatchView'
import { DamagePeriodView, DamagePeriodsTab } from './DamagePeriodView'
import { DamageSettingsView } from './DamageSettingsView'
import {
  DAMAGE_NAME,
  DAMAGE_STATUS_LABELS,
  MISHANDLING_COLOR,
  NOT_APPLICABLE_COLOR,
  NOT_APPLICABLE_LABEL,
  NOT_DEDUCTED_LABEL,
  batchFolio,
  deleteReport,
  fetchBatches,
  fetchPendingReports,
  fetchReports,
  reportFolio,
  startBatch,
  type DamageReport,
  type DamageStatus,
} from './lib/damages'
import {
  COLOR,
  Chip,
  ErrorText,
  GhostButton,
  Modal,
  PrimaryButton,
  SectionTitle,
  StatusBadge,
  errMsg,
  fieldControlClass,
  fieldLabelClass,
  ringStyle,
  useCanManageDamages,
  useDamagesLive,
} from './ui'

type Tab = 'reportes' | 'trabajar' | 'historial' | 'malmanejo' | 'ajustes'

/**
 * Inventory → Control de Averías (`?view=averias`). Pestañas internas con
 * `&tab=` y el lote abierto con `&lote=<id>`, sin rutas nuevas.
 *   - Reportes: listado de todas las averías reportadas desde el QR.
 *   - Trabajar averías: toma las pendientes en un lote (solo gestor).
 *   - Historial: lotes trabajados (reimprimir el reporte).
 *   - Mal manejo: reporte por semana o mes cerrado, con observación por área y
 *     un solo correo con CC a los jefes involucrados (`&periodo=<id>`).
 *   - QR y ajustes: QR del formulario, departamentos y políticas (solo gestor).
 */
export function DamageControlView() {
  const [params, setParams] = useSearchParams()
  const canManage = useCanManageDamages()
  const tab = (params.get('tab') as Tab | null) ?? 'reportes'
  const batchId = params.get('lote')
  const periodId = params.get('periodo')

  function go(next: { tab?: Tab; lote?: string | null; periodo?: string | null }) {
    const p = new URLSearchParams(params)
    if (next.tab) p.set('tab', next.tab)
    if (next.lote) p.set('lote', next.lote)
    else p.delete('lote')
    if (next.periodo) p.set('periodo', next.periodo)
    else p.delete('periodo')
    setParams(p)
  }

  if (batchId) {
    return <DamageBatchView batchId={batchId} canManage={!!canManage} onBack={() => go({ tab, lote: null })} />
  }
  if (periodId) {
    return (
      <DamagePeriodView
        periodId={periodId}
        canManage={!!canManage}
        onBack={() => go({ tab: 'malmanejo', periodo: null })}
        onOpenBatch={(id) => go({ tab: 'historial', lote: id })}
      />
    )
  }

  const tabs: [Tab, string][] = [
    ['reportes', 'Reportes'],
    ...(canManage ? ([['trabajar', 'Trabajar averías']] as [Tab, string][]) : []),
    ['historial', 'Historial'],
    ['malmanejo', 'Mal manejo'],
    ...(canManage ? ([['ajustes', 'QR y ajustes']] as [Tab, string][]) : []),
  ]
  const current = tabs.some(([t]) => t === tab) ? tab : 'reportes'

  return (
    <div className="space-y-6">
      <SectionTitle
        title={DAMAGE_NAME}
        subtitle="Los colaboradores reportan desde el QR; Inventory trabaja las averías acumuladas, revisa las políticas de manejo y confirma el lote. El mal manejo se reporta por semana o mes cerrado."
      />
      <div className="flex flex-wrap gap-2">
        {tabs.map(([t, label]) => (
          <Chip key={t} color={COLOR} active={current === t} onClick={() => go({ tab: t, lote: null })}>
            {label}
          </Chip>
        ))}
      </div>
      {current === 'reportes' ? <ReportsTab canManage={!!canManage} onOpenBatch={(id) => go({ lote: id })} /> : null}
      {current === 'trabajar' && canManage ? <WorkTab onOpenBatch={(id) => go({ tab: 'trabajar', lote: id })} /> : null}
      {current === 'historial' ? <HistoryTab onOpenBatch={(id) => go({ tab: 'historial', lote: id })} /> : null}
      {current === 'malmanejo' ? <DamagePeriodsTab canManage={!!canManage} onOpenPeriod={(id) => go({ tab: 'malmanejo', periodo: id })} /> : null}
      {current === 'ajustes' && canManage ? <DamageSettingsView /> : null}
    </div>
  )
}

/* =====================================================================
 * Reportes
 * ===================================================================== */

type StatusFilter = DamageStatus | 'todas'

function ReportsTab({ canManage, onOpenBatch }: { canManage: boolean; onOpenBatch: (id: string) => void }) {
  const today = todaySV()
  const [status, setStatus] = useState<StatusFilter>('pendiente')
  const [from, setFrom] = useState(addDaysISO(today, -30))
  const [to, setTo] = useState(today)
  const [search, setSearch] = useState('')
  const [toDelete, setToDelete] = useState<DamageReport | null>(null)
  const ring = ringStyle(COLOR)

  // Pendientes: todas, sin importar la fecha (las acumuladas hasta hoy).
  const { data, error, reload } = useDamagesLive(
    () => (status === 'pendiente' ? fetchPendingReports() : fetchReports(from, to)),
    [status, from, to],
  )

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? [])
      .filter((r) => status === 'todas' || status === 'pendiente' || r.status === status)
      .filter(
        (r) =>
          !q ||
          r.sku.toLowerCase().includes(q) ||
          (r.product_description ?? '').toLowerCase().includes(q) ||
          r.reporter_name.toLowerCase().includes(q) ||
          r.reporter_code.toLowerCase().includes(q) ||
          r.origin_name.toLowerCase().includes(q) ||
          reportFolio(r.folio).toLowerCase().includes(q),
      )
  }, [data, search, status])

  const statuses: StatusFilter[] = ['pendiente', 'en_trabajo', 'actualizado', 'todas']

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <Chip key={s} color={COLOR} active={status === s} onClick={() => setStatus(s)}>
              {s === 'todas' ? 'Todas' : DAMAGE_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
        {status !== 'pendiente' ? (
          <div className="flex items-end gap-2">
            <label className="w-36">
              <span className={fieldLabelClass}>Desde</span>
              <input type="date" className={`${fieldControlClass} [color-scheme:dark]`} style={ring} value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label className="w-36">
              <span className={fieldLabelClass}>Hasta</span>
              <input type="date" className={`${fieldControlClass} [color-scheme:dark]`} style={ring} value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
          </div>
        ) : null}
        <label className="min-w-48 flex-1">
          <span className={fieldLabelClass}>Buscar</span>
          <input className={fieldControlClass} style={ring} placeholder="SKU, descripción, colaborador, origen, folio…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      <ErrorText>{error}</ErrorText>

      <p className="text-xs text-white/45">
        {data === null
          ? 'Cargando…'
          : `${rows.length} avería(s) · ${rows.reduce((s, r) => s + r.quantity, 0)} unidades${status === 'pendiente' ? ' pendientes de trabajar' : ''}`}
      </p>

      {rows.length ? (
        <GlassCard className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-[11px] tracking-wider text-white/45 uppercase">
              <tr className="border-b border-neurale-border">
                <th className="px-3 py-2.5">Folio</th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5">Colaborador</th>
                <th className="px-3 py-2.5">Origen</th>
                <th className="px-3 py-2.5">SKU</th>
                <th className="px-3 py-2.5 text-right">Cant.</th>
                <th className="px-3 py-2.5">¿Descontada?</th>
                <th className="px-3 py-2.5">Observación</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neurale-border/60 align-top last:border-0">
                  <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-white/70">{reportFolio(r.folio)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-white/70">{formatDateTimeSV(r.created_at)}</td>
                  <td className="px-3 py-2.5 text-white/85">
                    {r.reporter_name}
                    <span className="block text-xs text-white/40">{r.reporter_code}</span>
                  </td>
                  <td className="px-3 py-2.5 text-white/75">{r.origin_name}</td>
                  <td className="px-3 py-2.5 text-white">
                    <span className="font-mono">{r.sku}</span>
                    {r.product_description ? <span className="block max-w-56 text-xs text-white/55">{r.product_description}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-right text-white">{r.quantity}</td>
                  <td className="px-3 py-2.5">
                    {r.deducted_from_location ? (
                      <span className="text-[#34d399]">Sí</span>
                    ) : (
                      <span style={{ color: MISHANDLING_COLOR }}>{NOT_DEDUCTED_LABEL}</span>
                    )}
                  </td>
                  <td className="max-w-64 px-3 py-2.5 text-white/65">{r.observation}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                    {r.not_applicable ? (
                      <span className="mt-1 block text-[11px] font-semibold whitespace-nowrap" style={{ color: NOT_APPLICABLE_COLOR }}>
                        {NOT_APPLICABLE_LABEL}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {r.batch_id ? (
                      <GhostButton onClick={() => onOpenBatch(r.batch_id!)}>Ver lote</GhostButton>
                    ) : canManage ? (
                      <GhostButton onClick={() => setToDelete(r)}>Eliminar</GhostButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      ) : data !== null ? (
        <p className="text-sm text-white/45">No hay averías con estos filtros.</p>
      ) : null}

      {toDelete ? (
        <DeleteReportModal
          report={toDelete}
          onClose={() => setToDelete(null)}
          onDone={() => {
            setToDelete(null)
            reload()
          }}
        />
      ) : null}
    </div>
  )
}

function DeleteReportModal({ report, onClose, onDone }: { report: DamageReport; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal
      title={`Eliminar ${reportFolio(report.folio)}`}
      subtitle={`SKU ${report.sku} · ${report.quantity} u. · ${report.reporter_name}`}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancelar</GhostButton>
          <PrimaryButton
            color={MISHANDLING_COLOR}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await deleteReport(report.id)
                onDone()
              } catch (e) {
                setError(errMsg(e))
                setBusy(false)
              }
            }}
          >
            Eliminar
          </PrimaryButton>
        </>
      }
    >
      <p className="text-sm text-white/70">Úsalo solo para reportes duplicados o erróneos. No se puede deshacer.</p>
      <ErrorText>{error}</ErrorText>
    </Modal>
  )
}

/* =====================================================================
 * Trabajar averías
 * ===================================================================== */

function WorkTab({ onOpenBatch }: { onOpenBatch: (id: string) => void }) {
  const pending = useDamagesLive(fetchPendingReports, [])
  const batches = useDamagesLive(fetchBatches, [])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = (batches.data ?? []).filter((b) => b.status === 'en_trabajo')
  const reports = pending.data ?? []
  const selected = reports.filter((r) => !excluded.has(r.id))

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const id = await startBatch(selected.map((r) => r.id))
      onOpenBatch(id)
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {open.length ? (
        <GlassCard className="space-y-3 p-5" style={{ borderColor: withAlpha(COLOR, 0.35) }}>
          <h3 className="font-display text-base font-semibold text-white">Lotes en trabajo (sin confirmar)</h3>
          {open.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-white/75">
                <b className="text-white">{batchFolio(b.folio)}</b> · {b.reports} avería(s) · {b.worked_by_name || '—'} ·{' '}
                {formatDateTimeSV(b.created_at)}
              </span>
              <PrimaryButton color={COLOR} onClick={() => onOpenBatch(b.id)}>
                Continuar
              </PrimaryButton>
            </div>
          ))}
        </GlassCard>
      ) : null}

      <GlassCard className="space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-semibold text-white">Averías pendientes acumuladas</h3>
            <p className="mt-1 text-sm text-white/50">
              Van todas seleccionadas. Desmarca solo las que no vas a trabajar ahora.
            </p>
          </div>
          <div className="flex gap-2">
            <GhostButton onClick={() => setExcluded(new Set())}>Todas</GhostButton>
            <GhostButton onClick={() => setExcluded(new Set(reports.map((r) => r.id)))}>Ninguna</GhostButton>
          </div>
        </div>

        <ErrorText>{pending.error ?? error}</ErrorText>

        {pending.data === null ? (
          <p className="text-sm text-white/45">Cargando…</p>
        ) : reports.length === 0 ? (
          <p className="text-sm text-white/45">No hay averías pendientes.</p>
        ) : (
          <ul className="divide-y divide-neurale-border/60">
            {reports.map((r) => (
              <li key={r.id}>
                <label className="flex cursor-pointer items-start gap-3 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[#a78bfa]"
                    checked={!excluded.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                  <span className="flex-1">
                    <span className="font-mono text-white">{r.sku}</span>
                    {r.product_description ? <span className="text-white"> · {r.product_description}</span> : null}
                    <span className="text-white/70"> · {r.quantity} u. · {r.origin_name}</span>
                    {!r.deducted_from_location ? (
                      <span className="ml-2 text-xs" style={{ color: MISHANDLING_COLOR }}>
                        {NOT_DEDUCTED_LABEL.toLowerCase()}
                      </span>
                    ) : null}
                    <span className="block text-xs text-white/45">
                      {reportFolio(r.folio)} · {r.reporter_name} · {formatDateTimeSV(r.created_at)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neurale-border pt-4">
          <span className="text-sm text-white/60">
            {selected.length} seleccionada(s) · {selected.reduce((s, r) => s + r.quantity, 0)} unidades
          </span>
          <PrimaryButton color={COLOR} disabled={busy || selected.length === 0} onClick={start}>
            {busy ? 'Creando lote…' : `Trabajar ${selected.length} avería(s)`}
          </PrimaryButton>
        </div>
      </GlassCard>
    </div>
  )
}

/* =====================================================================
 * Historial
 * ===================================================================== */

function HistoryTab({ onOpenBatch }: { onOpenBatch: (id: string) => void }) {
  const { data, error } = useDamagesLive(fetchBatches, [])
  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      {data === null ? (
        <p className="text-sm text-white/45">Cargando…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-white/45">Todavía no hay lotes trabajados.</p>
      ) : (
        <GlassCard className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[11px] tracking-wider text-white/45 uppercase">
              <tr className="border-b border-neurale-border">
                <th className="px-3 py-2.5">Lote</th>
                <th className="px-3 py-2.5">Iniciado</th>
                <th className="px-3 py-2.5">Trabajado por</th>
                <th className="px-3 py-2.5 text-right">Averías</th>
                <th className="px-3 py-2.5 text-right">Unidades</th>
                <th className="px-3 py-2.5 text-right">No aplica</th>
                <th className="px-3 py-2.5 text-right">Mal manejo</th>
                <th className="px-3 py-2.5">Nº ajuste</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.id} className="border-b border-neurale-border/60 last:border-0">
                  <td className="px-3 py-2.5 font-mono text-white">{batchFolio(b.folio)}</td>
                  <td className="px-3 py-2.5 text-white/70">{formatDateTimeSV(b.created_at)}</td>
                  <td className="px-3 py-2.5 text-white/75">{b.worked_by_name || '—'}</td>
                  <td className="px-3 py-2.5 text-right text-white">{b.reports}</td>
                  <td className="px-3 py-2.5 text-right text-white">{b.units}</td>
                  <td className="px-3 py-2.5 text-right" style={{ color: b.notApplicable ? NOT_APPLICABLE_COLOR : undefined }}>
                    {b.notApplicable}
                  </td>
                  <td className="px-3 py-2.5 text-right" style={{ color: b.mishandled ? MISHANDLING_COLOR : undefined }}>
                    {b.mishandled}
                  </td>
                  <td className="px-3 py-2.5 text-white/70">{b.erp_adjustment_ref || '—'}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <GhostButton onClick={() => onOpenBatch(b.id)}>Abrir</GhostButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  )
}
