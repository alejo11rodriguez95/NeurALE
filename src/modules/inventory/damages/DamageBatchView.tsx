import { useEffect, useMemo, useState } from 'react'

import { formatDateTimeSV } from '@/modules/storage/isq/lib/isq'
import { GlassCard } from '@/shared/components/GlassCard'
import { withAlpha } from '@/shared/modules'

import {
  MISHANDLING_COLOR,
  NOT_APPLICABLE_COLOR,
  NOT_APPLICABLE_LABEL,
  NOT_DEDUCTED_LABEL,
  batchFolio,
  cancelBatch,
  closeBatch,
  fetchBatchDetail,
  reportFolio,
  saveBatch,
  setFinding,
  setNotApplicable,
  type BatchDetail,
  type DamagePolicy,
  type DamageReport,
} from './lib/damages'
import { printBatchReport } from './lib/print'
import {
  COLOR,
  ErrorText,
  GhostButton,
  Modal,
  PrimaryButton,
  StatusBadge,
  errMsg,
  fieldControlClass,
  fieldLabelClass,
  ringStyle,
  useDamagesLive,
} from './ui'

/**
 * Lote de averías: Inventory revisa cada SKU contra las políticas de manejo,
 * marca las que "No aplica como avería" (no salen en el reporte para el
 * ajuste), deja su observación final, imprime el reporte para el ajuste y
 * confirma el lote (todo queda ACTUALIZADO). Confirmado, queda de solo lectura.
 * El seguimiento de mal manejo por área + correo se hace después, por semana o
 * mes cerrado (pestaña "Mal manejo" → DamagePeriodView).
 */
export function DamageBatchView({ batchId, canManage, onBack }: { batchId: string; canManage: boolean; onBack: () => void }) {
  const { data, error, reload } = useDamagesLive(() => fetchBatchDetail(batchId), [batchId])
  const [actionError, setActionError] = useState<string | null>(null)

  if (error && !data) {
    return (
      <div className="space-y-4">
        <GhostButton onClick={onBack}>← Volver</GhostButton>
        <ErrorText>{error}</ErrorText>
      </div>
    )
  }
  if (!data) return <p className="text-sm text-white/45">Cargando lote…</p>

  const editable = canManage && data.batch.status === 'en_trabajo'

  return (
    <div className="space-y-6">
      <GhostButton onClick={onBack}>← Volver a la lista</GhostButton>
      <BatchHeader d={data} />
      <ErrorText>{actionError}</ErrorText>
      <PolicyReview d={data} editable={editable} onError={setActionError} onChanged={reload} />
      <FinalSection d={data} editable={editable} onError={setActionError} onChanged={reload} onCancelled={onBack} />
    </div>
  )
}

function BatchHeader({ d }: { d: BatchDetail }) {
  const forAdjustment = d.reports.filter((r) => !r.not_applicable)
  const units = forAdjustment.reduce((s, r) => s + r.quantity, 0)
  const notApplicable = d.reports.length - forAdjustment.length
  const mishandled = new Set(d.findings.map((f) => f.report_id)).size
  const stat = (label: string, value: string | number, c?: string) => (
    <div>
      <span className="block text-[11px] tracking-wider text-white/45 uppercase">{label}</span>
      <span className="font-display text-xl font-semibold text-white" style={c ? { color: c } : undefined}>
        {value}
      </span>
    </div>
  )
  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-5 p-5">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="font-display text-2xl font-semibold text-white">Lote {batchFolio(d.batch.folio)}</h2>
          <StatusBadge status={d.batch.status} />
        </div>
        <p className="mt-1 text-sm text-white/50">
          {d.batch.worked_by_name || '—'} · iniciado {formatDateTimeSV(d.batch.created_at)}
          {d.batch.closed_at ? ` · confirmado ${formatDateTimeSV(d.batch.closed_at)}` : ''}
        </p>
      </div>
      <div className="flex gap-6">
        {stat('Averías', d.reports.length)}
        {stat('Para ajuste', `${forAdjustment.length} · ${units} u.`)}
        {stat('No aplica', notApplicable, notApplicable ? NOT_APPLICABLE_COLOR : undefined)}
        {stat('Mal manejo', mishandled, mishandled ? MISHANDLING_COLOR : undefined)}
      </div>
    </GlassCard>
  )
}

/* ---------- 1. Revisión de políticas ---------- */

function PolicyReview({
  d,
  editable,
  onError,
  onChanged,
}: {
  d: BatchDetail
  editable: boolean
  onError: (m: string | null) => void
  onChanged: () => void
}) {
  // Políticas activas + las inactivas que ya se usaron en este lote.
  const usedIds = new Set(d.findings.map((f) => f.policy_id))
  const policies = d.policies.filter((p) => p.active || usedIds.has(p.id))
  const failed = useMemo(() => new Set(d.findings.map((f) => `${f.report_id}:${f.policy_id}`)), [d.findings])
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function toggleNotApplicable(r: DamageReport) {
    const key = `${r.id}:na`
    setBusyKey(key)
    onError(null)
    try {
      await setNotApplicable(r.id, !r.not_applicable)
      onChanged()
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusyKey(null)
    }
  }

  async function toggle(r: DamageReport, p: DamagePolicy) {
    const key = `${r.id}:${p.id}`
    setBusyKey(key)
    onError(null)
    try {
      await setFinding(r.id, p.id, !failed.has(key))
      onChanged()
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold text-white">1 · Revisión de políticas de manejo</h3>
        <p className="mt-1 text-sm text-white/50">
          {editable
            ? `Toca una política para marcarla como NO cumplida en ese SKU (si el colaborador no marcó que se descontó de la ubicación, ya viene marcada). "${NOT_APPLICABLE_LABEL}" lo saca del reporte para el ajuste, pero si incumplió políticas sigue contando en el reporte de mal manejo de la semana o del mes.`
            : 'Políticas no cumplidas por SKU.'}
        </p>
      </div>
      <div className="space-y-2">
        {d.reports.map((r) => {
          const anyFailed = policies.some((p) => failed.has(`${r.id}:${p.id}`))
          return (
            <GlassCard
              key={r.id}
              className="p-4"
              style={
                anyFailed
                  ? { borderColor: withAlpha(MISHANDLING_COLOR, 0.45) }
                  : r.not_applicable
                    ? { borderColor: withAlpha(NOT_APPLICABLE_COLOR, 0.45) }
                    : undefined
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm">
                  <span className="font-mono text-base text-white">{r.sku}</span>
                  {r.product_description ? <span className="text-white"> · {r.product_description}</span> : null}
                  <span className="text-white/70">
                    {' '}
                    · {r.quantity} u. · {r.origin_name}
                  </span>
                  {anyFailed ? (
                    <span className="ml-2 text-xs font-semibold" style={{ color: MISHANDLING_COLOR }}>
                      MAL MANEJO
                    </span>
                  ) : null}
                  {r.not_applicable ? (
                    <span className="ml-2 text-xs font-semibold" style={{ color: NOT_APPLICABLE_COLOR }}>
                      NO APLICA COMO AVERÍA
                    </span>
                  ) : null}
                  <span className="block text-xs text-white/45">
                    {reportFolio(r.folio)} · {r.reporter_name} · {formatDateTimeSV(r.created_at)} ·{' '}
                    {r.deducted_from_location ? 'Descontada de la ubicación' : NOT_DEDUCTED_LABEL}
                  </span>
                  <span className="mt-1 block text-white/60">“{r.observation}”</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!editable || busyKey === `${r.id}:na`}
                  title="No entra en el reporte impreso para el ajuste. Si incumplió políticas, sí sale en el reporte de mal manejo."
                  onClick={() => toggleNotApplicable(r)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default"
                  style={
                    r.not_applicable
                      ? { background: withAlpha(NOT_APPLICABLE_COLOR, 0.16), borderColor: NOT_APPLICABLE_COLOR, color: NOT_APPLICABLE_COLOR }
                      : { borderColor: 'var(--color-neurale-border)', color: 'rgba(255,255,255,0.55)', borderStyle: 'dashed' }
                  }
                >
                  {r.not_applicable ? `⊘ ${NOT_APPLICABLE_LABEL}` : `${NOT_APPLICABLE_LABEL}?`}
                </button>
                {policies.map((p) => {
                  const key = `${r.id}:${p.id}`
                  const isFailed = failed.has(key)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!editable || busyKey === key}
                      title={p.description ?? undefined}
                      onClick={() => toggle(r, p)}
                      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-default"
                      style={
                        isFailed
                          ? { background: withAlpha(MISHANDLING_COLOR, 0.16), borderColor: MISHANDLING_COLOR, color: MISHANDLING_COLOR }
                          : { borderColor: 'var(--color-neurale-border)', color: 'rgba(255,255,255,0.55)' }
                      }
                    >
                      {isFailed ? '✗ No cumplió: ' : '✓ '}
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </GlassCard>
          )
        })}
      </div>
    </section>
  )
}

/* ---------- 2. Observación final, impresión y confirmación ---------- */

function FinalSection({
  d,
  editable,
  onError,
  onChanged,
  onCancelled,
}: {
  d: BatchDetail
  editable: boolean
  onError: (m: string | null) => void
  onChanged: () => void
  onCancelled: () => void
}) {
  const [note, setNote] = useState(d.batch.final_note ?? '')
  const [erp, setErp] = useState(d.batch.erp_adjustment_ref ?? '')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'close' | 'cancel' | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const ring = ringStyle(COLOR)

  useEffect(() => {
    setNote(d.batch.final_note ?? '')
    setErp(d.batch.erp_adjustment_ref ?? '')
  }, [d.batch.final_note, d.batch.erp_adjustment_ref])

  const dirty = note !== (d.batch.final_note ?? '') || erp !== (d.batch.erp_adjustment_ref ?? '')
  const forAdjustment = d.reports.filter((r) => !r.not_applicable).length

  async function save() {
    setBusy(true)
    onError(null)
    try {
      await saveBatch(d.batch.id, note, erp)
      onChanged()
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function print() {
    onError(null)
    try {
      // La ventana se abre primero (sin await antes): si no, el navegador la bloquea como emergente.
      printBatchReport({ ...d, batch: { ...d.batch, final_note: note || null, erp_adjustment_ref: erp || null } })
      if (editable && dirty) {
        await saveBatch(d.batch.id, note, erp)
        onChanged()
      }
    } catch (e) {
      onError(errMsg(e))
    }
  }

  async function runConfirm() {
    setBusy(true)
    setModalError(null)
    try {
      if (confirm === 'close') {
        await closeBatch(d.batch.id, note, erp)
        setConfirm(null)
        onChanged()
      } else {
        await cancelBatch(d.batch.id)
        setConfirm(null)
        onCancelled()
      }
    } catch (e) {
      setModalError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-display text-base font-semibold text-white">2 · Observación final y confirmación</h3>
      <GlassCard className="space-y-4 p-5">
        <label className="block">
          <span className={fieldLabelClass}>Observación de las averías trabajadas (va en el reporte impreso)</span>
          <textarea className={fieldControlClass} style={ring} rows={3} disabled={!editable} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="block sm:w-80">
          <span className={fieldLabelClass}>Nº de ajuste en el sistema de la empresa (opcional)</span>
          <input className={fieldControlClass} style={ring} disabled={!editable} value={erp} onChange={(e) => setErp(e.target.value)} />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <GhostButton onClick={print}>Imprimir reporte del lote</GhostButton>
          {editable ? (
            <>
              <GhostButton disabled={busy || !dirty} onClick={save}>
                Guardar observación
              </GhostButton>
              <span className="flex-1" />
              <GhostButton onClick={() => setConfirm('cancel')}>Cancelar lote</GhostButton>
              <PrimaryButton color={COLOR} disabled={busy} onClick={() => setConfirm('close')}>
                Confirmar trabajado → ACTUALIZADO
              </PrimaryButton>
            </>
          ) : null}
        </div>
        <p className="text-xs text-white/40">
          El reporte impreso lleva {forAdjustment} avería(s) para el ajuste
          {d.reports.length - forAdjustment ? ` (se excluyen ${d.reports.length - forAdjustment} marcada(s) "${NOT_APPLICABLE_LABEL}")` : ''}. El mal
          manejo se reporta y se envía por correo al cierre de la semana o del mes (pestaña "Mal manejo").
        </p>
      </GlassCard>

      {confirm ? (
        <Modal
          title={confirm === 'close' ? `Confirmar lote ${batchFolio(d.batch.folio)}` : `Cancelar lote ${batchFolio(d.batch.folio)}`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <GhostButton onClick={() => setConfirm(null)}>Volver</GhostButton>
              <PrimaryButton color={confirm === 'close' ? COLOR : MISHANDLING_COLOR} disabled={busy} onClick={runConfirm}>
                {confirm === 'close' ? 'Confirmar' : 'Cancelar lote'}
              </PrimaryButton>
            </>
          }
        >
          {confirm === 'close' ? (
            <p className="text-sm text-white/70">
              Las {d.reports.length} averías del lote quedarán en estado <b>ACTUALIZADO</b> y el lote ya no se podrá modificar
              ({forAdjustment} para ajuste{d.reports.length - forAdjustment ? `, ${d.reports.length - forAdjustment} no aplica como avería` : ''}). Confirma
              solo después de registrar el ajuste en el sistema de la empresa.
            </p>
          ) : (
            <p className="text-sm text-white/70">
              Las {d.reports.length} averías vuelven a PENDIENTE y se descartan las políticas marcadas y las marcas de "{NOT_APPLICABLE_LABEL}" de este lote.
            </p>
          )}
          <ErrorText>{modalError}</ErrorText>
        </Modal>
      ) : null}
    </section>
  )
}
