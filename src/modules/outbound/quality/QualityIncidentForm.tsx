import { useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/outbound/components/formStyles'
import {
  QUALITY_ERROR_TYPES,
  QUALITY_ERROR_TYPE_LABELS,
  UNITS_OF_MEASURE,
  createQualityIncident,
  type NewQualityIncident,
} from '@/modules/outbound/lib/qualityIncidents'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

const EMPTY_FORM: NewQualityIncident = {
  sku: '',
  quantity: 0,
  lot: '',
  expiration_date: '',
  unit_of_measure: UNITS_OF_MEASURE[0],
  branch: '',
  order_number: '',
  location: '',
  error_type: 'faltante',
  prepared_by: '',
  verified_by: '',
}

export function QualityIncidentForm({
  onCreated,
  onCancel,
}: {
  onCreated: () => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<NewQualityIncident>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof NewQualityIncident>(key: K, value: NewQualityIncident[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.sku || !form.quantity || !form.branch || !form.order_number || !form.prepared_by || !form.verified_by) {
      setError('Completa los campos obligatorios: SKU, cantidad, sucursal, pedido, quién preparó y quién verificó.')
      return
    }

    setSubmitting(true)
    try {
      await createQualityIncident({
        ...form,
        lot: form.lot || null,
        expiration_date: form.expiration_date || null,
        location: form.location || null,
      })
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la incidencia.')
    } finally {
      setSubmitting(false)
    }
  }

  const ring = ringStyle(moduleDef.color)

  return (
    <GlassCard className="p-6">
      <h2 className="font-display text-lg font-semibold text-white">Nueva incidencia de calidad</h2>
      <p className="mt-1 text-sm text-white/50">
        Registra lo encontrado durante la preparación del pedido.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabelClass}>SKU *</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
            placeholder="Ej. 0012345"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Cantidad *</label>
          <input
            type="number"
            step="any"
            className={fieldControlClass}
            style={ring}
            value={form.quantity || ''}
            onChange={(e) => set('quantity', Number(e.target.value))}
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Unidad de medida</label>
          <select
            className={fieldControlClass}
            style={ring}
            value={form.unit_of_measure}
            onChange={(e) => set('unit_of_measure', e.target.value)}
          >
            {UNITS_OF_MEASURE.map((u) => (
              <option key={u} value={u} className="bg-neurale-deep">
                {u}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={fieldLabelClass}>Lote</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={form.lot ?? ''}
            onChange={(e) => set('lot', e.target.value)}
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Fecha de vencimiento</label>
          <input
            type="date"
            className={fieldControlClass}
            style={ring}
            value={form.expiration_date ?? ''}
            onChange={(e) => set('expiration_date', e.target.value)}
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Sucursal *</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={form.branch}
            onChange={(e) => set('branch', e.target.value)}
            placeholder="Nombre de la sucursal"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Pedido *</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={form.order_number}
            onChange={(e) => set('order_number', e.target.value)}
            placeholder="No. de pedido"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Ubicación</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={form.location ?? ''}
            onChange={(e) => set('location', e.target.value)}
            placeholder="Ej. Rack A-12"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Tipo de error *</label>
          <select
            className={fieldControlClass}
            style={ring}
            value={form.error_type}
            onChange={(e) => set('error_type', e.target.value as NewQualityIncident['error_type'])}
          >
            {QUALITY_ERROR_TYPES.map((t) => (
              <option key={t} value={t} className="bg-neurale-deep">
                {QUALITY_ERROR_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={fieldLabelClass}>Quién preparó *</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={form.prepared_by}
            onChange={(e) => set('prepared_by', e.target.value)}
            placeholder="Nombre"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Quién verificó *</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={form.verified_by}
            onChange={(e) => set('verified_by', e.target.value)}
            placeholder="Nombre"
          />
        </div>

        {error ? (
          <p className="sm:col-span-2 text-sm text-rose-400">{error}</p>
        ) : null}

        <div className="mt-2 flex gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full px-5 py-2 text-sm font-medium text-neurale-bg transition-opacity disabled:opacity-50"
            style={{ background: moduleDef.color }}
          >
            {submitting ? 'Guardando…' : 'Guardar incidencia'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-neurale-border px-5 py-2 text-sm font-medium text-white/70"
          >
            Cancelar
          </button>
        </div>
      </form>
    </GlassCard>
  )
}
