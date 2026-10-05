import { useEffect, useMemo, useState } from 'react'

import { formatDateTimeSV } from '@/modules/storage/isq/lib/isq'
import { GlassCard } from '@/shared/components/GlassCard'
import { withAlpha } from '@/shared/modules'

import {
  MISHANDLING_COLOR,
  NOT_APPLICABLE_COLOR,
  NOT_APPLICABLE_LABEL,
  PERIOD_STATUS_COLORS,
  PERIOD_STATUS_LABELS,
  batchFolio,
  closePeriod,
  completedPeriods,
  createPeriod,
  deletePeriod,
  fetchPeriodDetail,
  fetchPeriods,
  involvedCc,
  markPeriodEmailed,
  mishandlingByDepartment,
  periodLabel,
  reopenPeriod,
  reportFolio,
  savePeriod,
  savePeriodNote,
  type DepartmentMishandling,
  type PeriodDetail,
  type PeriodKind,
  type PeriodStatus,
} from './lib/damages'
import { MAILTO_SAFE_LENGTH, mailtoHref, periodMishandlingEmail, printPeriodDepartmentReport, printPeriodReport } from './lib/print'
import {
  COLOR,
  Chip,
  ErrorText,
  GhostButton,
  Modal,
  PrimaryButton,
  errMsg,
  fieldControlClass,
  fieldLabelClass,
  ringStyle,
  useDamagesLive,
} from './ui'

/**
 * Reporte de MAL MANEJO por período (v3, pedido de Josué 2026-10-05): ya no se
 * hace en cada lote, sino al cierre de la semana (lunes a domingo) o del mes.
 * Entran las averías de los lotes CONFIRMADOS dentro del período. Inventory deja
 * una observación por área, arma UN solo correo con copia a los jefes de las
 * áreas involucradas y cierra el período: sus averías quedan amarradas a él y no
 * se repiten en otro reporte (se puede reabrir).
 */

const SENDER = 'Equipo de Inventory'

function PeriodBadge({ status }: { status: PeriodStatus }) {
  const c = PERIOD_STATUS_COLORS[status]
  return (
    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider whitespace-nowrap" style={{ background: withAlpha(c, 0.15), color: c }}>
      {PERIOD_STATUS_LABELS[status]}
    </span>
  )
}

/* =====================================================================
 * Pestaña "Mal manejo": generar / listar reportes de período
 * ===================================================================== */

export function DamagePeriodsTab({ canManage, onOpenPeriod }: { canManage: boolean; onOpenPeriod: (id: string) => void }) {
  const { data, error } = useDamagesLive(fetchPeriods, [])
  const [kind, setKind] = useState<PeriodKind>('semana')
  const options = useMemo(() => completedPeriods(kind, 12), [kind])
  const [start, setStart] = useState(options[0]?.start ?? '')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const ring = ringStyle(COLOR)

  useEffect(() => setStart(options[0]?.start ?? ''), [options])

  const existing = (k: PeriodKind, s: string) => (data ?? []).find((p) => p.kind === k && p.start_date === s)
  const chosen = existing(kind, start)

  async function generate() {
    setBusy(true)
    setActionError(null)
    try {
      onOpenPeriod(chosen ? chosen.id : await createPeriod(kind, start))
    } catch (e) {
      setActionError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      {canManage ? (
        <GlassCard className="space-y-4 p-5">
          <div>
            <h3 className="font-display text-base font-semibold text-white">Reporte de mal manejo por período</h3>
            <p className="mt-1 text-sm text-white/50">
              Elige una semana (lunes a domingo) o un mes ya terminados. Entran las averías de los lotes confirmados en ese período que
              todavía no salieron en otro reporte cerrado. Ahí haces la observación de cada área y armas un solo correo con copia a los
              jefes involucrados.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex gap-2">
              <Chip color={COLOR} active={kind === 'semana'} onClick={() => setKind('semana')}>
                Semana
              </Chip>
              <Chip color={COLOR} active={kind === 'mes'} onClick={() => setKind('mes')}>
                Mes
              </Chip>
            </div>
            <label className="min-w-64 flex-1 sm:flex-none">
              <span className={fieldLabelClass}>Período terminado</span>
              <select className={`${fieldControlClass} [color-scheme:dark]`} style={ring} value={start} onChange={(e) => setStart(e.target.value)}>
                {options.map((o) => {
                  const ex = existing(kind, o.start)
                  return (
                    <option key={o.start} value={o.start}>
                      {periodLabel({ kind, start_date: o.start, end_date: o.end })}
                      {ex ? ` — ${PERIOD_STATUS_LABELS[ex.status]}` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <PrimaryButton color={COLOR} disabled={busy || !start} onClick={generate}>
              {chosen ? 'Abrir reporte' : busy ? 'Generando…' : 'Generar reporte'}
            </PrimaryButton>
          </div>
          <ErrorText>{actionError}</ErrorText>
        </GlassCard>
      ) : null}

      <ErrorText>{error}</ErrorText>
      {data === null ? (
        <p className="text-sm text-white/45">Cargando…</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-white/45">Todavía no hay reportes de mal manejo por período.</p>
      ) : (
        <GlassCard className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-[11px] tracking-wider text-white/45 uppercase">
              <tr className="border-b border-neurale-border">
                <th className="px-3 py-2.5">Período</th>
                <th className="px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5">Correo</th>
                <th className="px-3 py-2.5">Cerrado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-b border-neurale-border/60 last:border-0">
                  <td className="px-3 py-2.5 text-white">{periodLabel(p)}</td>
                  <td className="px-3 py-2.5">
                    <PeriodBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2.5 text-white/70">{p.emailed_at ? `Abierto ${formatDateTimeSV(p.emailed_at)}` : '—'}</td>
                  <td className="px-3 py-2.5 text-white/70">{p.closed_at ? formatDateTimeSV(p.closed_at) : '—'}</td>
                  <td className="px-3 py-2.5 text-right">
                    <GhostButton onClick={() => onOpenPeriod(p.id)}>Abrir</GhostButton>
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

/* =====================================================================
 * Detalle de un período
 * ===================================================================== */

export function DamagePeriodView({
  periodId,
  canManage,
  onBack,
  onOpenBatch,
}: {
  periodId: string
  canManage: boolean
  onBack: () => void
  onOpenBatch: (id: string) => void
}) {
  const { data, error, reload } = useDamagesLive(() => fetchPeriodDetail(periodId), [periodId])
  const [actionError, setActionError] = useState<string | null>(null)
  // Borradores locales: observación por área y general (se guardan al salir del campo / al usarse).
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState<string | null>(null)

  if (error && !data) {
    return (
      <div className="space-y-4">
        <GhostButton onClick={onBack}>← Volver</GhostButton>
        <ErrorText>{error}</ErrorText>
      </div>
    )
  }
  if (!data) return <p className="text-sm text-white/45">Cargando reporte del período…</p>

  const editable = canManage && data.period.status === 'abierto'
  const groups = mishandlingByDepartment(data)
  const noteOf = (g: DepartmentMishandling) => notes[g.origin_id] ?? g.note ?? ''
  const allNotes = Object.fromEntries(groups.map((g) => [g.origin_id, noteOf(g)]))
  const generalNote = general ?? data.period.general_note ?? ''

  /** Guarda las observaciones que sigan en borrador (antes de correo / imprimir / cerrar). */
  async function flushNotes() {
    for (const g of groups) {
      const n = noteOf(g)
      if (n !== (g.note ?? '')) await savePeriodNote(data!.period.id, g.origin_id, n)
    }
  }

  return (
    <div className="space-y-6">
      <GhostButton onClick={onBack}>← Volver a los reportes de mal manejo</GhostButton>
      <PeriodHeader d={data} groups={groups} />
      <ErrorText>{actionError}</ErrorText>

      <section className="space-y-3">
        <div>
          <h3 className="font-display text-base font-semibold text-white">1 · Mal manejo por área</h3>
          <p className="mt-1 text-sm text-white/50">
            Averías de los lotes confirmados en el período que no cumplieron alguna política de manejo. Las marcadas "{NOT_APPLICABLE_LABEL}"
            también salen aquí si incumplieron políticas.
          </p>
        </div>
        {groups.length === 0 ? (
          <GlassCard className="p-4 text-sm text-white/60">
            {data.reports.length
              ? 'Todas las averías del período cumplieron las políticas de manejo. No hay correo que enviar.'
              : 'No hay averías de lotes confirmados en este período (o ya salieron en otro reporte cerrado).'}
          </GlassCard>
        ) : (
          groups.map((g) => (
            <DepartmentCard
              key={g.origin_id}
              d={data}
              g={g}
              note={noteOf(g)}
              onNote={(v) => setNotes((prev) => ({ ...prev, [g.origin_id]: v }))}
              editable={editable}
              onError={setActionError}
              onChanged={reload}
              onOpenBatch={onOpenBatch}
            />
          ))
        )}
      </section>

      {groups.length ? (
        <section className="space-y-3">
          <h3 className="font-display text-base font-semibold text-white">2 · Correo de seguimiento</h3>
          <PeriodEmailCard
            d={data}
            groups={groups}
            notes={allNotes}
            generalNote={generalNote}
            editable={editable}
            flushNotes={flushNotes}
            onError={setActionError}
            onChanged={reload}
          />
        </section>
      ) : null}

      <CloseSection
        d={data}
        groups={groups}
        notes={allNotes}
        generalNote={generalNote}
        onGeneral={setGeneral}
        canManage={canManage}
        editable={editable}
        flushNotes={flushNotes}
        onError={setActionError}
        onChanged={() => {
          setGeneral(null)
          reload()
        }}
        onDeleted={onBack}
        step={groups.length ? 3 : 2}
      />
    </div>
  )
}

function PeriodHeader({ d, groups }: { d: PeriodDetail; groups: DepartmentMishandling[] }) {
  const mishandled = groups.reduce((s, g) => s + g.reports.length, 0)
  const na = d.reports.filter((r) => r.not_applicable).length
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
          <h2 className="font-display text-2xl font-semibold text-white">{periodLabel(d.period)}</h2>
          <PeriodBadge status={d.period.status} />
        </div>
        <p className="mt-1 text-sm text-white/50">
          Reporte de mal manejo · lotes confirmados del {d.period.start_date.split('-').reverse().join('/')} al{' '}
          {d.period.end_date.split('-').reverse().join('/')}
          {d.period.closed_at ? ` · cerrado ${formatDateTimeSV(d.period.closed_at)}` : ''}
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        {stat('Averías trabajadas', d.reports.length)}
        {stat('Mal manejo', mishandled, mishandled ? MISHANDLING_COLOR : undefined)}
        {stat('Áreas', groups.length)}
        {stat('No aplica', na, na ? NOT_APPLICABLE_COLOR : undefined)}
      </div>
    </GlassCard>
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
  onOpenBatch,
}: {
  d: PeriodDetail
  g: DepartmentMishandling
  note: string
  onNote: (v: string) => void
  editable: boolean
  onError: (m: string | null) => void
  onChanged: () => void
  onOpenBatch: (id: string) => void
}) {
  const ring = ringStyle(COLOR)
  const saved = g.note ?? ''

  async function persist() {
    onError(null)
    try {
      await savePeriodNote(d.period.id, g.origin_id, note)
      onChanged()
    } catch (e) {
      onError(errMsg(e))
    }
  }

  async function print() {
    onError(null)
    try {
      printPeriodDepartmentReport(d, g, note)
      if (editable && note !== saved) await persist()
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

      <ul className="space-y-1.5 text-sm">
        {g.reports.map(({ report: r, failed }) => (
          <li key={r.id} className="text-white/75">
            <span className="font-mono text-xs text-white/50">{reportFolio(r.folio)}</span> · <span className="font-mono text-white">{r.sku}</span>
            {r.product_description ? <span className="text-white"> · {r.product_description}</span> : null} · {r.quantity} u.
            {r.batch_id && d.batchFolios[r.batch_id] ? (
              <>
                {' '}
                ·{' '}
                <button type="button" className="text-white/60 underline decoration-dotted hover:text-white" onClick={() => onOpenBatch(r.batch_id!)}>
                  {batchFolio(d.batchFolios[r.batch_id])}
                </button>
              </>
            ) : null}
            {r.not_applicable ? (
              <span className="ml-2 text-[11px] font-semibold" style={{ color: NOT_APPLICABLE_COLOR }}>
                {NOT_APPLICABLE_LABEL.toUpperCase()}
              </span>
            ) : null}
            <span className="block text-xs" style={{ color: MISHANDLING_COLOR }}>
              No cumplió: {failed.join(', ')}
            </span>
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

/** Correo único del período: Para = destinatario principal (Ajustes); CC = jefes de las áreas involucradas. */
function PeriodEmailCard({
  d,
  groups,
  notes,
  generalNote,
  editable,
  flushNotes,
  onError,
  onChanged,
}: {
  d: PeriodDetail
  groups: DepartmentMishandling[]
  notes: Record<string, string>
  generalNote: string
  editable: boolean
  flushNotes: () => Promise<void>
  onError: (m: string | null) => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const to = d.mailTo
  const cc = involvedCc(groups, to)
  const missingBoss = groups.filter((g) => g.emails.length === 0).map((g) => g.origin_name)
  const mail = periodMishandlingEmail(d, groups, notes, generalNote, SENDER)
  const href = mailtoHref(to, cc, mail.subject, mail.body)
  const tooLong = href.length > MAILTO_SAFE_LENGTH
  const emailedAt = d.period.emailed_at

  async function openMail() {
    setBusy(true)
    onError(null)
    try {
      await flushNotes()
      if (generalNote !== (d.period.general_note ?? '')) await savePeriod(d.period.id, generalNote)
      await markPeriodEmailed(d.period.id, to, cc)
      onChanged()
      window.location.href = tooLong
        ? mailtoHref(to, cc, mail.subject, `${mail.body.slice(0, 1000)}\n\n[…] Detalle completo por área en el reporte adjunto.`)
        : href
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function copyBody() {
    try {
      await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.detail}`)
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
          <h4 className="font-display text-base font-semibold text-white">Un solo correo para el período</h4>
          <p className="text-sm text-white/55">
            Resumen por área ({groups.map((g) => g.origin_name).join(', ')}) con copia a los jefes involucrados. El detalle de cada avería va en el
            reporte del período (sección 3) — imprímelo como PDF y adjúntalo.
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

      <pre className="max-h-64 overflow-auto rounded-lg border border-neurale-border bg-black/20 p-3 font-sans text-xs whitespace-pre-wrap text-white/70">
        {mail.body}
      </pre>

      {missingBoss.length ? (
        <p className="text-xs text-[#fbbf24]">
          Sin correo de jefe configurado: {missingBoss.join(', ')}. Agrégalo en QR y ajustes → Departamentos, o cópialo a mano en Outlook.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <GhostButton onClick={copyBody}>{copied ? 'Copiado ✓' : 'Copiar correo con el detalle de cada avería'}</GhostButton>
        {editable ? (
          <PrimaryButton color={COLOR} disabled={busy} onClick={openMail}>
            {emailedAt ? 'Abrir correo otra vez' : 'Abrir correo en Outlook'}
          </PrimaryButton>
        ) : null}
      </div>
      {tooLong && editable ? (
        <p className="text-xs text-[#fbbf24]">El resumen es largo para un correo armado: se abrirá recortado. Usa "Copiar correo…" y pégalo completo.</p>
      ) : null}
    </GlassCard>
  )
}

function CloseSection({
  d,
  groups,
  notes,
  generalNote,
  onGeneral,
  canManage,
  editable,
  flushNotes,
  onError,
  onChanged,
  onDeleted,
  step,
}: {
  d: PeriodDetail
  groups: DepartmentMishandling[]
  notes: Record<string, string>
  generalNote: string
  onGeneral: (v: string) => void
  canManage: boolean
  editable: boolean
  flushNotes: () => Promise<void>
  onError: (m: string | null) => void
  onChanged: () => void
  onDeleted: () => void
  step: number
}) {
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'close' | 'reopen' | 'delete' | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const ring = ringStyle(COLOR)
  const dirty = generalNote !== (d.period.general_note ?? '')
  const pendingMail = groups.length > 0 && !d.period.emailed_at

  async function save() {
    setBusy(true)
    onError(null)
    try {
      await savePeriod(d.period.id, generalNote)
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
      printPeriodReport(d, groups, notes, generalNote)
      if (editable) {
        await flushNotes()
        if (dirty) await savePeriod(d.period.id, generalNote)
        onChanged()
      }
    } catch (e) {
      onError(errMsg(e))
    }
  }

  async function run() {
    setBusy(true)
    setModalError(null)
    try {
      if (confirm === 'close') {
        await flushNotes()
        await closePeriod(d.period.id, generalNote)
      } else if (confirm === 'reopen') {
        await reopenPeriod(d.period.id)
      } else {
        await deletePeriod(d.period.id)
        setConfirm(null)
        onDeleted()
        return
      }
      setConfirm(null)
      onChanged()
    } catch (e) {
      setModalError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-display text-base font-semibold text-white">{step} · Observación general, reporte y cierre</h3>
      <GlassCard className="space-y-4 p-5">
        <label className="block">
          <span className={fieldLabelClass}>Observación general de Inventory (va en el correo y en el reporte)</span>
          <textarea className={fieldControlClass} style={ring} rows={3} disabled={!editable} value={generalNote} onChange={(e) => onGeneral(e.target.value)} />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <GhostButton onClick={print}>Imprimir reporte del período</GhostButton>
          {editable ? (
            <>
              <GhostButton disabled={busy || !dirty} onClick={save}>
                Guardar observación
              </GhostButton>
              <span className="flex-1" />
              <GhostButton onClick={() => setConfirm('delete')}>Descartar reporte</GhostButton>
              <PrimaryButton color={COLOR} disabled={busy} onClick={() => setConfirm('close')}>
                Cerrar período
              </PrimaryButton>
            </>
          ) : canManage && d.period.status === 'cerrado' ? (
            <>
              <span className="flex-1" />
              <GhostButton onClick={() => setConfirm('reopen')}>Reabrir período</GhostButton>
            </>
          ) : null}
        </div>
        {editable && pendingMail ? <p className="text-xs text-[#fbbf24]">Falta abrir el correo de seguimiento (sección 2) para poder cerrar.</p> : null}
      </GlassCard>

      {confirm ? (
        <Modal
          title={
            confirm === 'close'
              ? `Cerrar ${periodLabel(d.period).toLowerCase()}`
              : confirm === 'reopen'
                ? `Reabrir ${periodLabel(d.period).toLowerCase()}`
                : 'Descartar reporte del período'
          }
          onClose={() => setConfirm(null)}
          footer={
            <>
              <GhostButton onClick={() => setConfirm(null)}>Volver</GhostButton>
              <PrimaryButton color={confirm === 'delete' ? MISHANDLING_COLOR : COLOR} disabled={busy} onClick={run}>
                {confirm === 'close' ? 'Cerrar período' : confirm === 'reopen' ? 'Reabrir' : 'Descartar'}
              </PrimaryButton>
            </>
          }
        >
          <p className="text-sm text-white/70">
            {confirm === 'close'
              ? `Las ${d.reports.length} averías del período quedan amarradas a este reporte y no saldrán en otro (por ejemplo, en el reporte del mes si ya cerraste la semana). El reporte queda de solo lectura.`
              : confirm === 'reopen'
                ? 'Sus averías se sueltan y se vuelven a calcular. Si mientras tanto se cierra otro reporte que las incluya, saldrán de este.'
                : 'Se borran las observaciones guardadas de este reporte. Las averías no cambian; puedes volver a generarlo.'}
          </p>
          <ErrorText>{modalError}</ErrorText>
        </Modal>
      ) : null}
    </section>
  )
}
