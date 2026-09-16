import { useEffect, useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/outbound/components/formStyles'
import {
  QUALITY_ERROR_TYPE_LABELS,
  QUALITY_STATUSES,
  QUALITY_STATUS_COLORS,
  QUALITY_STATUS_LABELS,
  fetchQualityIncidents,
  updateQualityIncident,
  type QualityIncident,
  type QualityIncidentStatus,
} from '@/modules/outbound/lib/qualityIncidents'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'picking')!

function StatusBadge({ status }: { status: QualityIncidentStatus }) {
  const color = QUALITY_STATUS_COLORS[status]
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: withAlpha(color, 0.15), color }}
    >
      {QUALITY_STATUS_LABELS[status]}
    </span>
  )
}

/**
 * "Gestión de Control de Calidad" — vista del jefe de Picking para dar
 * seguimiento a las incidencias que Outbound reporta durante la preparación
 * de pedidos. Lee y actualiza la misma tabla `outbound_quality_incidents`
 * (ver `src/modules/outbound/lib/qualityIncidents.ts`) — Outbound sigue
 * siendo el dueño de esa tabla, Picking solo la consume.
 */
export function QualityManagementView() {
  const [incidents, setIncidents] = useState<QualityIncident[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<QualityIncidentStatus | 'todas'>('abierta')
  const [editingId, setEditingId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      setIncidents(await fetchQualityIncidents())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las incidencias.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = incidents?.filter((i) => filter === 'todas' || i.status === filter) ?? []

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-white">
        Gestión de Control de Calidad
      </h2>
      <p className="mt-1 text-sm text-white/50">
        Incidencias reportadas por Outbound durante la preparación de pedidos.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {(['todas', ...QUALITY_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            style={
              filter === s
                ? { background: moduleDef.color, color: '#05070d', borderColor: moduleDef.color }
                : { borderColor: 'var(--color-neurale-border)', color: 'rgba(255,255,255,0.6)' }
            }
          >
            {s === 'todas' ? 'Todas' : QUALITY_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {error ? (
          <GlassCard className="p-6 text-sm text-rose-400">{error}</GlassCard>
        ) : incidents === null ? (
          <GlassCard className="p-6 text-sm text-white/50">Cargando incidencias…</GlassCard>
        ) : filtered.length === 0 ? (
          <GlassCard className="p-6 text-sm text-white/50">
            No hay incidencias en este filtro.
          </GlassCard>
        ) : (
          filtered.map((incident) => (
            <GlassCard
              key={incident.id}
              className="p-5"
              style={{ borderColor: withAlpha(moduleDef.color, 0.2) }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-semibold text-white">
                      {incident.sku}
                    </span>
                    <StatusBadge status={incident.status} />
                  </div>
                  <p className="mt-1 text-sm text-white/60">
                    {QUALITY_ERROR_TYPE_LABELS[incident.error_type]} · Pedido{' '}
                    {incident.order_number} · {incident.branch}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    Preparó {incident.prepared_by} · Verificó {incident.verified_by} ·{' '}
                    {new Date(incident.created_at).toLocaleString('es-SV', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setEditingId(editingId === incident.id ? null : incident.id)}
                  className="shrink-0 rounded-full border border-neurale-border px-3 py-1.5 text-xs text-white/70"
                >
                  {editingId === incident.id ? 'Cerrar' : 'Dar seguimiento'}
                </button>
              </div>

              {editingId === incident.id ? (
                <IncidentFollowUp
                  incident={incident}
                  onSaved={(updated) => {
                    setIncidents((prev) =>
                      prev ? prev.map((i) => (i.id === updated.id ? updated : i)) : prev,
                    )
                    setEditingId(null)
                  }}
                />
              ) : null}
            </GlassCard>
          ))
        )}
      </div>
    </div>
  )
}

function IncidentFollowUp({
  incident,
  onSaved,
}: {
  incident: QualityIncident
  onSaved: (updated: QualityIncident) => void
}) {
  const [status, setStatus] = useState<QualityIncidentStatus>(incident.status)
  const [assignedTo, setAssignedTo] = useState(incident.assigned_to ?? '')
  const [notes, setNotes] = useState(incident.resolution_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ring = ringStyle(moduleDef.color)

  async function save(nextStatus: QualityIncidentStatus) {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateQualityIncident(incident.id, {
        status: nextStatus,
        assigned_to: assignedTo || null,
        resolution_notes: notes || null,
        resolved_at: nextStatus === 'resuelta' ? new Date().toISOString() : null,
      })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el seguimiento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-neurale-border pt-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabelClass}>Asignado a</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Nombre del responsable de resolverlo"
          />
        </div>
        <div>
          <label className={fieldLabelClass}>Estado</label>
          <select
            className={fieldControlClass}
            style={ring}
            value={status}
            onChange={(e) => setStatus(e.target.value as QualityIncidentStatus)}
          >
            {QUALITY_STATUSES.map((s) => (
              <option key={s} value={s} className="bg-neurale-deep">
                {QUALITY_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={fieldLabelClass}>Notas de seguimiento</label>
          <textarea
            className={fieldControlClass}
            style={ring}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}

      <div className="mt-3 flex gap-3">
        <button
          onClick={() => save(status)}
          disabled={saving}
          className="rounded-full px-4 py-1.5 text-xs font-medium text-neurale-bg disabled:opacity-50"
          style={{ background: moduleDef.color }}
        >
          Guardar
        </button>
        {status !== 'resuelta' ? (
          <button
            onClick={() => save('resuelta')}
            disabled={saving}
            className="rounded-full border border-neurale-border px-4 py-1.5 text-xs text-white/70 disabled:opacity-50"
          >
            Marcar resuelta
          </button>
        ) : null}
      </div>
    </div>
  )
}
