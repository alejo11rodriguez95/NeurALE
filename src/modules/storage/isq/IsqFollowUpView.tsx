import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/shared/auth/AuthContext'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

import {
  ISQ_AGING_ALERT_HOURS,
  ISQ_NAME,
  ISQ_ROOT_CAUSES,
  ISQ_ROOT_CAUSE_LABELS,
  ISQ_STATUSES,
  ISQ_STATUS_LABELS,
  ageHours,
  fetchAllActiveEmployees,
  fetchIsqIncidents,
  fetchPendingIsqIncidents,
  formatAge,
  formatDateTimeSV,
  isClosed,
  updateIsqFollowUp,
  type EmployeeOption,
  type IsqIncident,
  type IsqRootCause,
  type IsqStatus,
} from './lib/isq'
import {
  Chip,
  DateRangePicker,
  GhostButton,
  PrimaryButton,
  SectionTitle,
  StatusBadge,
  canFollowUpIsq,
  fieldControlClass,
  fieldLabelClass,
  ringStyle,
  useDateRange,
  useIsqLive,
} from './ui'

const inbound = MODULES.find((m) => m.id === 'inbound')!
const ring = ringStyle(inbound.color)

type Mode = 'pendientes' | 'fecha'

/**
 * Inbound → "ISQ": bandeja de las incidencias que Storage le reporta a
 * Inbound. Se asigna responsable, causa raíz y acción correctiva, y se cierra
 * como "Corregida" o "No procede" (con justificación). Lee y actualiza la
 * tabla `storage_isq_incidents` de Storage (import cross-módulo intencional —
 * Storage sigue siendo el dueño). Solo puede tocar el seguimiento: los datos
 * del reporte los protege un trigger en la base.
 */
export function IsqFollowUpView() {
  const { adminUser } = useAuth()
  const [mode, setMode] = useState<Mode>('pendientes')
  const [range, setRange] = useDateRange()
  const [statusFilter, setStatusFilter] = useState<IsqStatus | 'todas'>('todas')
  const [openId, setOpenId] = useState<string | null>(null)
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    fetchAllActiveEmployees().then(setEmployees).catch(() => setEmployees([]))
    const i = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(i)
  }, [])

  const { data, error, setData } = useIsqLive(
    () => (mode === 'pendientes' ? fetchPendingIsqIncidents() : fetchIsqIncidents(range.from, range.to)),
    [mode, range.from, range.to],
  )

  const rows = useMemo(
    () => (data ?? []).filter((i) => mode === 'pendientes' || statusFilter === 'todas' || i.status === statusFilter),
    [data, mode, statusFilter],
  )
  const overdue = rows.filter((i) => !isClosed(i.status) && ageHours(i, now) >= ISQ_AGING_ALERT_HOURS).length
  const canEdit = canFollowUpIsq(adminUser)

  return (
    <div className="space-y-5">
      <SectionTitle
        title={`${ISQ_NAME} · Seguimiento`}
        subtitle="Incidencias que Storage reportó al almacenar mercadería recibida por Inbound. Asigna responsable, registra la causa y ciérralas."
      />

      <div className="flex flex-wrap gap-2">
        <Chip color={inbound.color} active={mode === 'pendientes'} onClick={() => setMode('pendientes')}>
          Pendientes (todas las fechas)
        </Chip>
        <Chip color={inbound.color} active={mode === 'fecha'} onClick={() => setMode('fecha')}>
          Por fecha
        </Chip>
      </div>

      {mode === 'fecha' ? (
        <div className="space-y-3">
          <DateRangePicker value={range} onChange={setRange} color={inbound.color} />
          <div className="flex flex-wrap gap-2">
            {(['todas', ...ISQ_STATUSES] as const).map((s) => (
              <Chip key={s} color={inbound.color} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {s === 'todas' ? 'Todos los estados' : ISQ_STATUS_LABELS[s]}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}

      {data ? (
        <div className="flex flex-wrap gap-3 text-sm text-white/60">
          <span>
            <b className="text-white">{rows.length}</b> {mode === 'pendientes' ? 'pendientes' : 'en el filtro'}
          </span>
          {overdue ? (
            <span className="text-rose-300">
              ⚠ <b>{overdue}</b> con más de {ISQ_AGING_ALERT_HOURS} h abiertas
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        {error ? (
          <GlassCard className="p-6 text-sm text-rose-400">{error}</GlassCard>
        ) : data === null ? (
          <GlassCard className="p-6 text-sm text-white/50">Cargando incidencias…</GlassCard>
        ) : rows.length === 0 ? (
          <GlassCard className="p-6 text-sm text-white/50">
            {mode === 'pendientes' ? 'No hay incidencias ISQ pendientes. 🎉' : 'No hay incidencias en este filtro.'}
          </GlassCard>
        ) : (
          rows.map((i) => {
            const age = ageHours(i, now)
            const late = !isClosed(i.status) && age >= ISQ_AGING_ALERT_HOURS
            return (
              <GlassCard key={i.id} className="p-5" style={{ borderColor: late ? 'rgba(248,113,113,0.45)' : withAlpha(inbound.color, 0.2) }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display font-semibold text-white">{i.type_label}</span>
                      <StatusBadge status={i.status} />
                      <span className={`text-xs tabular-nums ${late ? 'text-rose-300' : 'text-white/40'}`}>
                        {isClosed(i.status) ? `Cerrada en ${formatAge(age)}` : `Abierta hace ${formatAge(age)}`}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-white/65">
                      SKU <b className="text-white/85">{i.sku}</b> · Recepción / OC <b className="text-white/85">{i.reference}</b>
                    </p>
                    <p className="mt-0.5 text-xs text-white/40">
                      Almacenador {i.stower_name} · {formatDateTimeSV(i.reported_at)}
                      {i.extra.length ? ` · ${i.extra.map((x) => `${x.label}: ${x.value}`).join(' · ')}` : ''}
                    </p>
                    {i.responsible_name || i.root_cause || i.corrective_action ? (
                      <p className="mt-1.5 text-xs text-white/55">
                        {i.responsible_name ? <>Responsable: <b className="text-white/75">{i.responsible_name}</b></> : null}
                        {i.root_cause ? <> · Causa: {ISQ_ROOT_CAUSE_LABELS[i.root_cause]}</> : null}
                        {i.corrective_action ? <> · Acción: {i.corrective_action}</> : null}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <GhostButton onClick={() => setOpenId(openId === i.id ? null : i.id)}>
                      {openId === i.id ? 'Cerrar' : 'Dar seguimiento'}
                    </GhostButton>
                  ) : null}
                </div>

                {openId === i.id ? (
                  <FollowUpForm
                    incident={i}
                    employees={employees}
                    onSaved={(u) => {
                      setData((prev) => (prev ? prev.map((x) => (x.id === u.id ? u : x)) : prev))
                      setOpenId(null)
                    }}
                  />
                ) : null}
              </GlassCard>
            )
          })
        )}
      </div>
    </div>
  )
}

function FollowUpForm({
  incident,
  employees,
  onSaved,
}: {
  incident: IsqIncident
  employees: EmployeeOption[]
  onSaved: (u: IsqIncident) => void
}) {
  const [status, setStatus] = useState<IsqStatus>(incident.status === 'abierta' ? 'en_seguimiento' : incident.status)
  const [respId, setRespId] = useState(incident.responsible_employee_id ?? '')
  const [cause, setCause] = useState<IsqRootCause | ''>(incident.root_cause ?? '')
  const [action, setAction] = useState(incident.corrective_action ?? '')
  const [notes, setNotes] = useState(incident.followup_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(next: IsqStatus) {
    setError(null)
    const resp = employees.find((e) => e.id === respId)
    if (next !== 'abierta' && !resp && !incident.responsible_name) return setError('Asigna un responsable.')
    if (next === 'corregida' && !action.trim()) return setError('Describe la acción correctiva antes de marcarla como corregida.')
    if (next === 'no_procede' && !notes.trim()) return setError('Justifica en las notas por qué no procede.')
    setSaving(true)
    try {
      const u = await updateIsqFollowUp(incident.id, {
        status: next,
        responsible_employee_id: resp?.id ?? incident.responsible_employee_id,
        responsible_name: resp?.full_name ?? incident.responsible_name,
        root_cause: cause || null,
        corrective_action: action.trim() || null,
        followup_notes: notes.trim() || null,
      })
      onSaved(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-neurale-border pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className={fieldLabelClass}>Responsable *</span>
          <select className={fieldControlClass} style={ring} value={respId} onChange={(e) => setRespId(e.target.value)}>
            <option value="" className="bg-neurale-deep">
              {incident.responsible_name && !incident.responsible_employee_id ? incident.responsible_name : 'Selecciona…'}
            </option>
            {employees.map((e) => (
              <option key={e.id} value={e.id} className="bg-neurale-deep">
                {e.full_name}
                {e.position ? ` · ${e.position}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={fieldLabelClass}>Estado</span>
          <select className={fieldControlClass} style={ring} value={status} onChange={(e) => setStatus(e.target.value as IsqStatus)}>
            {ISQ_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-neurale-deep">
                {ISQ_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={fieldLabelClass}>Causa raíz</span>
          <select className={fieldControlClass} style={ring} value={cause} onChange={(e) => setCause(e.target.value as IsqRootCause | '')}>
            <option value="" className="bg-neurale-deep">
              Sin definir
            </option>
            {ISQ_ROOT_CAUSES.map((c) => (
              <option key={c} value={c} className="bg-neurale-deep">
                {ISQ_ROOT_CAUSE_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={fieldLabelClass}>Acción correctiva</span>
          <input className={fieldControlClass} style={ring} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ej. Se re-estibó el pallet y se re-etiquetó" />
        </label>
        <label className="sm:col-span-2">
          <span className={fieldLabelClass}>Notas de seguimiento</span>
          <textarea className={fieldControlClass} style={ring} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <PrimaryButton color={inbound.color} disabled={saving} onClick={() => save(status)}>
          Guardar
        </PrimaryButton>
        {status !== 'corregida' ? (
          <GhostButton disabled={saving} onClick={() => save('corregida')}>
            ✓ Marcar corregida
          </GhostButton>
        ) : null}
      </div>
    </div>
  )
}
