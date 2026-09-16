import { useEffect, useState } from 'react'

import { DockQrCode } from '@/modules/outbound/dock-routes/DockQrCode'
import { DockScanner } from '@/modules/outbound/dock-routes/DockScanner'
import { DockVisitForm } from '@/modules/outbound/dock-routes/DockVisitForm'
import {
  closeDockVisit,
  createDockVisit,
  fetchActiveDockVisits,
  fetchDocks,
  fetchDrivers,
  type Dock,
  type DockVisit,
  type Driver,
} from '@/modules/outbound/lib/dockRoutes'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

function elapsed(since: string): string {
  const ms = Date.now() - new Date(since).getTime()
  const minutes = Math.max(0, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function DockRoutesView() {
  const [docks, setDocks] = useState<Dock[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [activeVisits, setActiveVisits] = useState<DockVisit[] | null>(null)
  const [showCodes, setShowCodes] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [editingVisit, setEditingVisit] = useState<DockVisit | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    setError(null)
    try {
      const [d, dr, av] = await Promise.all([
        fetchDocks(),
        fetchDrivers(),
        fetchActiveDockVisits(),
      ])
      setDocks(d)
      setDrivers(dr)
      setActiveVisits(av)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los muelles.')
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function handleScan(code: string) {
    setScanning(false)
    setNotice(null)
    setError(null)

    const dock = docks.find((d) => d.code.toLowerCase() === code.toLowerCase())
    if (!dock) {
      setError(`El código "${code}" no corresponde a ningún muelle registrado.`)
      return
    }

    const existing = (activeVisits ?? []).find((v) => v.dock_id === dock.id)
    try {
      if (existing) {
        await closeDockVisit(existing.id)
        setNotice(`Salida registrada: ${dock.label} (${existing.vehicle_plate || 'sin placa'}).`)
        loadAll()
      } else {
        const visit = await createDockVisit(dock.id)
        setNotice(`Llegada registrada en ${dock.label}. Completa los datos del camión.`)
        setEditingVisit(visit)
        loadAll()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el escaneo.')
    }
  }

  if (scanning) {
    return <DockScanner onScan={handleScan} onCancel={() => setScanning(false)} />
  }

  if (editingVisit) {
    return (
      <DockVisitForm
        visit={editingVisit}
        drivers={drivers}
        onDriverCreated={(d) => setDrivers((prev) => [...prev, d])}
        onSaved={() => {
          setEditingVisit(null)
          loadAll()
        }}
        onCancel={() => setEditingVisit(null)}
      />
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setScanning(true)}
          className="rounded-full px-5 py-2 text-sm font-medium text-neurale-bg"
          style={{ background: moduleDef.color }}
        >
          📷 Escanear muelle
        </button>
        <button
          onClick={() => setShowCodes((v) => !v)}
          className="rounded-full border border-neurale-border px-4 py-2 text-sm text-white/70"
        >
          {showCodes ? 'Ocultar códigos QR' : 'Ver códigos QR de los muelles'}
        </button>
      </div>

      {notice ? <p className="text-sm text-emerald-400">{notice}</p> : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      {showCodes ? (
        <div className="flex flex-wrap gap-3">
          {docks.map((dock) => (
            <DockQrCode key={dock.id} code={dock.code} label={dock.label} />
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="font-display text-lg font-semibold text-white">Camiones en muelle</h2>
        <div className="mt-4">
          {activeVisits === null ? (
            <GlassCard className="p-6 text-sm text-white/50">Cargando…</GlassCard>
          ) : activeVisits.length === 0 ? (
            <GlassCard className="p-6 text-sm text-white/50">
              No hay camiones en los muelles en este momento.
            </GlassCard>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {activeVisits.map((visit) => (
                <GlassCard
                  key={visit.id}
                  className="p-5"
                  style={{ borderColor: withAlpha(moduleDef.color, 0.22) }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display font-semibold text-white">
                      {visit.dock?.label ?? 'Muelle'}
                    </span>
                    <span className="text-xs text-white/45">
                      hace {elapsed(visit.arrived_at)}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-white/70">
                    <div className="flex justify-between">
                      <dt className="text-white/45">Placa</dt>
                      <dd>{visit.vehicle_plate || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/45">Piloto</dt>
                      <dd>{visit.driver?.full_name ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/45">Responsable</dt>
                      <dd>{visit.responsible || '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/45">Pallets</dt>
                      <dd>{visit.pallet_count ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-white/45">Sucursales</dt>
                      <dd className="text-right">
                        {visit.branches_loaded?.join(', ') || '—'}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => setEditingVisit(visit)}
                      className="rounded-full border border-neurale-border px-3 py-1.5 text-xs text-white/70"
                    >
                      Editar datos
                    </button>
                    <button
                      onClick={async () => {
                        await closeDockVisit(visit.id)
                        loadAll()
                      }}
                      className="rounded-full px-3 py-1.5 text-xs font-medium text-neurale-bg"
                      style={{ background: moduleDef.color }}
                    >
                      Registrar salida
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
