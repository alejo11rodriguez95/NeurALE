import { useEffect, useMemo, useState } from 'react'

import { formatDateTimeSV } from '@/modules/storage/isq/lib/isq'
import { GlassCard } from '@/shared/components/GlassCard'
import { withAlpha } from '@/shared/modules'

import {
  MISHANDLING_COLOR,
  batchFolio,
  cancelBatch,
  closeBatch,
  fetchBatchDetail,
  involvedCc,
  markBatchEmailed,
  mishandlingByDepartment,
  reportFolio,
  saveBatch,
  saveNotice,
  setFinding,
  type BatchDetail,
  type DamagePolicy,
  type DamageReport,
  type DepartmentMishandling,
} from './lib/damages'
import { MAILTO_SAFE_LENGTH, batchMishandlingEmail, mailtoHref, printBatchReport, printDepartmentReport } from './lib/print'
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
 * arma el seguimiento por departamento (reporte + correo), deja su
 * observación final, imprime el reporte para el ajuste y confirma el lote
 * (todo queda ACTUALIZADO). Confirmado, queda de solo lectura.
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
      <Departments d={data} editable={editable} onError={setActionError} onChanged={reload} />
      <FinalSection d={data} editable={editable} onError={setActionError} onChanged={reload} onCancelled={onBack} />
    </div>
  )
}

function BatchHeader({ d }: { d: BatchDetail }) {
  const units = d.reports.reduce((s, r) => s + r.quantity, 0)
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
        {stat('Unidades', units)}
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
            ? 'Toca una política para marcarla como NO cumplida en ese SKU. Si el colaborador reportó que no se descontó de la ubicación, ya viene marcada.'
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
              style={anyFailed ? { borderColor: withAlpha(MISHANDLING_COLOR, 0.45) } : undefined}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm">
                  <span className="font-mono text-base text-white">{r.sku}</span>
                  <span className="text-white/70">
                    {' '}
                    · {r.quantity} u. · {r.origin_name}
                  </span>
                  {anyFailed ? (
                    <span className="ml-2 text-xs font-semibold" style={{ color: MISHANDLING_COLOR }}>
                      MAL MANEJO
                    </span>
                  ) : null}
                  <span className="block text-xs text-white/45">
                    {reportFolio(r.folio)} · {r.reporter_name} · {formatDateTimeSV(r.created_at)} · ¿descontada?{' '}
                    {r.deducted_from_location ? 'Sí' : 'No'}
                  </span>
                  <span className="mt-1 block text-white/60">“{r.observation}”</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
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

/* ---------- 2. Mal manejo por área + correo único ---------- */

function Departments({
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
  const groups = mishandlingByDepartment(d)
  // Observación por área (borrador local; se guarda al salir del campo).
  const [notes, setNotes] = useState<Record<string, string>>({})
  const noteOf = (g: DepartmentMishandling) => notes[g.origin_id] ?? g.notice?.note ?? ''

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold text-white">2 · Mal manejo por área y correo de seguimiento</h3>
        <p className="mt-1 text-sm text-white/50">
          Se envía <b>un solo correo</b> con el detalle de cada área, con copia a los jefes de las áreas involucradas. No se puede
          confirmar el lote sin abrir ese correo.
        </p>
      </div>
      {groups.length === 0 ? (
        <GlassCard className="p-4 text-sm text-white/60">Todas las averías cumplen las políticas. No hay correo que enviar.</GlassCard>
      ) : (
        <>
          {groups.map((g) => (
            <DepartmentCard
              key={g.origin_id}
              d={d}
              g={g}
              note={noteOf(g)}
              onNote={(v) => setNotes((prev) => ({ ...prev, [g.origin_id]: v }))}
              editable={editable}
              onError={onError}
              onChanged={onChanged}
            />
          ))}
          <BatchEmailCard
            d={d}
            groups={groups}
            notes={Object.fromEntries(groups.map((g) => [g.origin_id, noteOf(g)]))}
            editable={editable}
            onError={onError}
            onChanged={onChanged}
          />
        </>
      )}
    </section>
  )
}

function DepartmentCard({
  d,
  g,
  note,
  onNote,
  editable,
  onError,
  onChanged,
}: {
  d: BatchDetail
  g: DepartmentMishandling
  note: string
  onNote: (v: string) => void
  editable: boolean
  onError: (m: string | null) => void
  onChanged: () => void
}) {
  const ring = ringStyle(COLOR)
  const saved = g.notice?.note ?? ''

  async function persist() {
    onError(null)
    try {
      await saveNotice(d.batch.id, g.origin_id, note)
      onChanged()
    } catch (e) {
      onError(errMsg(e))
    }
  }

  function print() {
    onError(null)
    try {
      printDepartmentReport(d, { ...g, notice: g.notice ? { ...g.notice, note } : g.notice })
    } catch (e) {
      onError(errMsg(e))
    }
  }

  return (
    <GlassCard className="space-y-3 p-5" style={{ borderColor: withAlpha(MISHANDLING_COLOR, 0.35) }}>
      <div>
        <h4 className="font-display text-base font-semibold text-white">{g.origin_name}</h4>
        <p className="text-sm text-white/55">
          {g.reports.length} avería(s) con mal manejo · {g.reports.reduce((s, x) => s + x.report.quantity, 0)} unidades
        </p>
        <p className="mt-1 text-xs text-white/45">
          Jefe(s) en copia:{' '}
          {g.emails.length ? g.emails.join(', ') : <span style={{ color: '#fbbf24' }}>sin correo configurado (QR y ajustes → Departamentos)</span>}
        </p>
      </div>

      <ul className="space-y-1 text-sm">
        {g.reports.map(({ report: r, failed }) => (
          <li key={r.id} className="text-white/75">
            <span className="font-mono text-white">{r.sku}</span> · {r.quantity} u. —{' '}
            <span style={{ color: MISHANDLING_COLOR }}>{failed.join(', ')}</span>
          </li>
        ))}
      </ul>

      <label className="block">
        <span className={fieldLabelClass}>Observación de seguimiento para {g.origin_name} (va en el correo y en el reporte)</span>
        <textarea
          className={fieldControlClass}
          style={ring}
          rows={2}
          disabled={!editable}
          value={note}
          onChange={(e) => onNote(e.target.value)}
          onBlur={() => editable && note !== saved && persist()}
        />
      </label>

      <GhostButton onClick={print}>Imprimir reporte de {g.origin_name}</GhostButton>
    </GlassCard>
  )
}

/** Correo único del lote: Para = destinatario principal (Ajustes); CC = jefes de las áreas involucradas. */
function BatchEmailCard({
  d,
  groups,
  notes,
  editable,
  onError,
  onChanged,
}: {
  d: BatchDetail
  groups: DepartmentMishandling[]
  notes: Record<string, string>
  editable: boolean
  onError: (m: string | null) => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const to = d.mailTo
  const cc = involvedCc(groups, to)
  const missingBoss = groups.filter((g) => g.emails.length === 0).map((g) => g.origin_name)
  const mail = batchMishandlingEmail(d, groups, notes)
  const href = mailtoHref(to, cc, mail.subject, mail.body)
  const tooLong = href.length > MAILTO_SAFE_LENGTH
  const emailedAt = d.batch.emailed_at

  async function openMail() {
    setBusy(true)
    onError(null)
    try {
      // Guarda primero las observaciones por área que sigan en borrador.
      for (const g of groups) {
        const n = notes[g.origin_id] ?? ''
        if (n !== (g.notice?.note ?? '')) await saveNotice(d.batch.id, g.origin_id, n)
      }
      await markBatchEmailed(d.batch.id, to, cc)
      onChanged()
      window.location.href = tooLong
        ? mailtoHref(to, cc, mail.subject, `${mail.body.slice(0, 900)}\n\n[…] Detalle completo por área en el reporte adjunto.`)
        : href
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      onError('No se pudo copiar al portapapeles.')
    }
  }

  return (
    <GlassCard className="space-y-3 p-5" style={{ borderColor: withAlpha(COLOR, 0.45) }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold text-white">Correo de seguimiento del lote</h4>
          <p className="text-sm text-white/55">
            Un solo correo con {groups.length} área(s): {groups.map((g) => g.origin_name).join(', ')}.
          </p>
        </div>
        {emailedAt ? (
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: withAlpha('#34d399', 0.15), color: '#34d399' }}>
            Correo abierto · {formatDateTimeSV(emailedAt)}
          </span>
        ) : (
          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: withAlpha('#fbbf24', 0.15), color: '#fbbf24' }}>
            Correo pendiente
          </span>
        )}
      </div>

      <dl className="grid gap-1 text-sm sm:grid-cols-[4rem_1fr]">
        <dt className="text-white/45">Para</dt>
        <dd className="text-white/80">
          {to.length ? to.join(', ') : <span className="text-white/45">(vacío — lo eliges en Outlook; se configura en QR y ajustes)</span>}
        </dd>
        <dt className="text-white/45">CC</dt>
        <dd className="text-white/80">{cc.length ? cc.join(', ') : <span className="text-white/45">—</span>}</dd>
        <dt className="text-white/45">Asunto</dt>
        <dd className="text-white/80">{mail.subject}</dd>
      </dl>

      {missingBoss.length ? (
        <p className="text-xs text-[#fbbf24]">
          Sin correo de jefe configurado: {missingBoss.join(', ')}. Agrégalo en QR y ajustes → Departamentos, o cópialo a mano en Outlook.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <GhostButton onClick={copyBody}>{copied ? 'Copiado ✓' : 'Copiar texto del correo'}</GhostButton>
        {editable ? (
          <PrimaryButton color={COLOR} disabled={busy} onClick={openMail}>
            {emailedAt ? 'Abrir correo otra vez' : 'Abrir correo en Outlook'}
          </PrimaryButton>
        ) : null}
      </div>
      {tooLong && editable ? (
        <p className="text-xs text-[#fbbf24]">
          El detalle es largo para un correo armado: se abrirá resumido. Usa "Copiar texto del correo" para pegar el detalle completo.
        </p>
      ) : null}
      <p className="text-xs text-white/40">
        Imprime el reporte del lote como PDF (sección 3) y adjúntalo antes de enviar. Si cambias alguna política después de abrir el
        correo, hay que volver a abrirlo.
      </p>
    </GlassCard>
  )
}

/* ---------- 3. Observación final, impresión y confirmación ---------- */

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
  const pendingMail = mishandlingByDepartment(d).length > 0 && !d.batch.emailed_at

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
      <h3 className="font-display text-base font-semibold text-white">3 · Observación final y confirmación</h3>
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
        {editable && pendingMail ? (
          <p className="text-xs text-[#fbbf24]">Falta abrir el correo de seguimiento por mal manejo (sección 2).</p>
        ) : null}
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
              Las {d.reports.length} averías del lote quedarán en estado <b>ACTUALIZADO</b> y el lote ya no se podrá modificar.
              Confirma solo después de registrar el ajuste en el sistema de la empresa.
            </p>
          ) : (
            <p className="text-sm text-white/70">
              Las {d.reports.length} averías vuelven a PENDIENTE y se descartan las políticas marcadas y los seguimientos de este lote.
            </p>
          )}
          <ErrorText>{modalError}</ErrorText>
        </Modal>
      ) : null}
    </section>
  )
}
