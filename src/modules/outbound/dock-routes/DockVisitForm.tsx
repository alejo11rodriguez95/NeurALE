import { useState } from 'react'

import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/outbound/components/formStyles'
import {
  createDriver,
  updateDockVisit,
  type Driver,
  type DockVisit,
} from '@/modules/outbound/lib/dockRoutes'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

/**
 * Completa los datos de una visita ya creada (la llegada y el muelle quedan
 * registrados automáticamente al escanear — ver `DockRoutesView`).
 */
export function DockVisitForm({
  visit,
  drivers,
  onSaved,
  onCancel,
  onDriverCreated,
}: {
  visit: DockVisit
  drivers: Driver[]
  onSaved: () => void
  onCancel: () => void
  onDriverCreated: (driver: Driver) => void
}) {
  const [vehiclePlate, setVehiclePlate] = useState(visit.vehicle_plate)
  const [driverId, setDriverId] = useState(visit.driver_id ?? '')
  const [responsible, setResponsible] = useState(visit.responsible)
  const [palletCount, setPalletCount] = useState(visit.pallet_count?.toString() ?? '')
  const [branchesText, setBranchesText] = useState((visit.branches_loaded ?? []).join(', '))
  const [newDriverName, setNewDriverName] = useState('')
  const [addingDriver, setAddingDriver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ring = ringStyle(moduleDef.color)

  async function handleAddDriver() {
    if (!newDriverName.trim()) return
    setAddingDriver(true)
    try {
      const driver = await createDriver({ full_name: newDriverName.trim() })
      onDriverCreated(driver)
      setDriverId(driver.id)
      setNewDriverName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el motorista.')
    } finally {
      setAddingDriver(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!vehiclePlate || !responsible) {
      setError('Completa al menos la placa del vehículo y el responsable.')
      return
    }

    setSubmitting(true)
    try {
      await updateDockVisit(visit.id, {
        vehicle_plate: vehiclePlate,
        driver_id: driverId || null,
        responsible,
        pallet_count: palletCount ? Number(palletCount) : null,
        branches_loaded: branchesText
          ? branchesText.split(',').map((b) => b.trim()).filter(Boolean)
          : null,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la visita.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <GlassCard className="p-6" style={{ borderColor: moduleDef.color }}>
      <h3 className="font-display text-base font-semibold text-white">
        {visit.dock?.label ?? 'Muelle'} · llegada {new Date(visit.arrived_at).toLocaleTimeString('es-SV')}
      </h3>

      <form onSubmit={handleSubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={fieldLabelClass}>Vehículo (placa) *</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={vehiclePlate}
            onChange={(e) => setVehiclePlate(e.target.value)}
            placeholder="Ej. P123-456"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Piloto</label>
          <select
            className={fieldControlClass}
            style={ring}
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
          >
            <option value="" className="bg-neurale-deep">
              — Selecciona —
            </option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id} className="bg-neurale-deep">
                {d.full_name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              className={fieldControlClass}
              style={ring}
              value={newDriverName}
              onChange={(e) => setNewDriverName(e.target.value)}
              placeholder="Motorista nuevo…"
            />
            <button
              type="button"
              onClick={handleAddDriver}
              disabled={addingDriver || !newDriverName.trim()}
              className="mt-1.5 shrink-0 rounded-lg border border-neurale-border px-3 text-xs font-medium text-white/70 disabled:opacity-40"
            >
              + Agregar
            </button>
          </div>
        </div>

        <div>
          <label className={fieldLabelClass}>Responsable *</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={responsible}
            onChange={(e) => setResponsible(e.target.value)}
            placeholder="Nombre del responsable"
          />
        </div>

        <div>
          <label className={fieldLabelClass}>Cantidad de pallets</label>
          <input
            type="number"
            className={fieldControlClass}
            style={ring}
            value={palletCount}
            onChange={(e) => setPalletCount(e.target.value)}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={fieldLabelClass}>Sucursales cargadas</label>
          <input
            className={fieldControlClass}
            style={ring}
            value={branchesText}
            onChange={(e) => setBranchesText(e.target.value)}
            placeholder="Separadas por coma, ej. Metrocentro, Multiplaza"
          />
        </div>

        {error ? <p className="sm:col-span-2 text-sm text-rose-400">{error}</p> : null}

        <div className="mt-1 flex gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full px-5 py-2 text-sm font-medium text-neurale-bg disabled:opacity-50"
            style={{ background: moduleDef.color }}
          >
            {submitting ? 'Guardando…' : 'Guardar datos'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-neurale-border px-5 py-2 text-sm font-medium text-white/70"
          >
            Cerrar
          </button>
        </div>
      </form>
    </GlassCard>
  )
}
