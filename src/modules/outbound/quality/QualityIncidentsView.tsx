import { useEffect, useState } from 'react'

import { QualityIncidentForm } from '@/modules/outbound/quality/QualityIncidentForm'
import {
  QUALITY_ERROR_TYPE_LABELS,
  QUALITY_STATUS_COLORS,
  QUALITY_STATUS_LABELS,
  fetchQualityIncidents,
  type QualityIncident,
} from '@/modules/outbound/lib/qualityIncidents'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

function StatusBadge({ status }: { status: QualityIncident['status'] }) {
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

export function QualityIncidentsView() {
  const [incidents, setIncidents] = useState<QualityIncident[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setError(null)
    try {
      const data = await fetchQualityIncidents()
      setIncidents(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las incidencias.')
    }
  }

  useEffect(() => {
    load()
  }, [])

  if (showForm) {
    return (
      <QualityIncidentForm
        onCreated={() => {
          setShowForm(false)
          load()
        }}
        onCancel={() => setShowForm(false)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-white">Incidencias reportadas</h2>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-full px-4 py-2 text-sm font-medium text-neurale-bg"
          style={{ background: moduleDef.color }}
        >
          + Nueva incidencia
        </button>
      </div>

      <div className="mt-5">
        {error ? (
          <GlassCard className="p-6 text-sm text-rose-400">{error}</GlassCard>
        ) : incidents === null ? (
          <GlassCard className="p-6 text-sm text-white/50">Cargando incidencias…</GlassCard>
        ) : incidents.length === 0 ? (
          <GlassCard className="p-6 text-sm text-white/50">
            Todavía no hay incidencias reportadas.
          </GlassCard>
        ) : (
          <GlassCard className="overflow-x-auto p-0">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-neurale-border text-xs uppercase tracking-wide text-white/40">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Cant.</th>
                  <th className="px-4 py-3">Tipo de error</th>
                  <th className="px-4 py-3">Pedido</th>
                  <th className="px-4 py-3">Sucursal</th>
                  <th className="px-4 py-3">Preparó</th>
                  <th className="px-4 py-3">Verificó</th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id} className="border-b border-neurale-border/60 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-white/60">
                      {new Date(incident.created_at).toLocaleString('es-SV', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3 text-white">{incident.sku}</td>
                    <td className="px-4 py-3 text-white/80">
                      {incident.quantity} {incident.unit_of_measure}
                    </td>
                    <td className="px-4 py-3 text-white/80">
                      {QUALITY_ERROR_TYPE_LABELS[incident.error_type]}
                    </td>
                    <td className="px-4 py-3 text-white/80">{incident.order_number}</td>
                    <td className="px-4 py-3 text-white/80">{incident.branch}</td>
                    <td className="px-4 py-3 text-white/60">{incident.prepared_by}</td>
                    <td className="px-4 py-3 text-white/60">{incident.verified_by}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={incident.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        )}
      </div>
    </div>
  )
}
