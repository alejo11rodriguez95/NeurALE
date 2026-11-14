import { useSearchParams } from 'react-router-dom'

import { OptionCard } from '@/modules/dashboard/components/OptionCard'
import { canConfigureIsq, canReportIsq } from '@/modules/storage/isq/ui'
import { useAuth } from '@/shared/auth/AuthContext'
import { MODULES } from '@/shared/modules'

import { OPL_NAME, fetchOperators } from './lib/opl'
import { OplCountView } from './OplCountView'
import { OplOperatorsView } from './OplOperatorsView'
import { OplDiscrepancyView, OplResultsView } from './OplReviewViews'
import { EmptyState, ErrorState, useOplLive } from './ui'

const storage = MODULES.find((m) => m.id === 'storage')!

/**
 * Storage → "Auditoría OPL" (`?view=auditoria-opl`). Navegación interna con
 * parámetros extra (mismo precedente que Control de Averías):
 *   &sec=asignacion                         Asignación de OPL (configuradores)
 *   &sec=opl&opl=<id>[&audit=<id>]          Auditoría {OPL} → lista / conteo
 *   &sec=discrepancias[&audit=<id>]         Revisión de Discrepancias
 *   &sec=resultados[&audit=<id>]            Resultados y avance
 * Configurar OPL y cargar/cerrar auditorías: jefe de Storage, gerencia, admin
 * (o nivel con "editar" en Storage). Contar: cualquier usuario de Storage.
 */
export function OplAuditView() {
  const [params, setParams] = useSearchParams()
  const { adminUser } = useAuth()
  const canManage = canConfigureIsq(adminUser)
  const canCount = canReportIsq(adminUser)
  const sec = params.get('sec')
  const oplId = params.get('opl')
  const auditId = params.get('audit')
  const ops = useOplLive(() => fetchOperators(), [], canCount)

  function go(next: { sec?: string | null; opl?: string | null; audit?: string | null }) {
    const p: Record<string, string> = { view: params.get('view') ?? 'auditoria-opl' }
    if (next.sec) p.sec = next.sec
    if (next.opl) p.opl = next.opl
    if (next.audit) p.audit = next.audit
    setParams(p)
  }

  if (!canCount) return <p className="text-sm text-white/55">Solo los usuarios de Storage, gerencia o admin pueden entrar a la Auditoría OPL.</p>

  const back = (
    <button type="button" onClick={() => go({})} className="mb-5 text-sm text-white/50 hover:text-white/80">
      ← {OPL_NAME}
    </button>
  )

  if (sec === 'asignacion') {
    return (
      <div>
        {back}
        {canManage ? <OplOperatorsView /> : <p className="text-sm text-white/55">Solo el jefe de Storage, gerencia o admin configuran OPL.</p>}
      </div>
    )
  }

  if (sec === 'opl' && oplId) {
    const op = ops.data?.find((o) => o.id === oplId)
    return (
      <div>
        {!auditId ? back : null}
        {ops.error ? (
          <ErrorState>{ops.error}</ErrorState>
        ) : !ops.data ? (
          <EmptyState>Cargando…</EmptyState>
        ) : !op ? (
          <EmptyState>Ese OPL no existe o está inactivo.</EmptyState>
        ) : (
          <OplCountView operator={op} auditId={auditId} canManage={canManage} onOpenAudit={(id) => go({ sec: 'opl', opl: oplId, audit: id })} />
        )}
      </div>
    )
  }

  if (sec === 'discrepancias') {
    return (
      <div>
        {back}
        <OplDiscrepancyView auditId={auditId} canManage={canManage} onPickAudit={(id) => go({ sec: 'discrepancias', audit: id })} />
      </div>
    )
  }

  if (sec === 'resultados') {
    return (
      <div>
        {back}
        <OplResultsView auditId={auditId} canManage={canManage} onPickAudit={(id) => go({ sec: 'resultados', audit: id })} />
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-display text-lg font-semibold text-white">{OPL_NAME}</h2>
      <p className="mt-1 text-sm text-white/50">Auditoría de inventario de los operadores logísticos a partir de su Excel, contando por LPN desde el celular.</p>
      {ops.error ? <p className="mt-3 text-sm text-rose-400">{ops.error}</p> : null}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {canManage ? (
          <OptionCard
            color={storage.color}
            icon="🧩"
            title="Asignación de OPL"
            description="Agrega un operador logístico y parametriza su Excel: hoja, títulos y en base a qué se audita (LPN, SKU, descripción, cantidad, ubicación)."
            onClick={() => go({ sec: 'asignacion' })}
          />
        ) : null}
        {(ops.data ?? []).map((o) => (
          <OptionCard
            key={o.id}
            color={storage.color}
            icon="📋"
            title={`Auditoría ${o.name}`}
            description={`Carga el Excel de ${o.name} y cuenta por ${o.mapping.key_label} con la cámara del celular. Varias personas pueden contar a la vez.`}
            onClick={() => go({ sec: 'opl', opl: o.id })}
          />
        ))}
        <OptionCard
          color={storage.color}
          icon="⚖️"
          title="Revisión de Discrepancias"
          description="SKU que no cuadraron al terminar todos sus LPN: reconteo a ciegas y cierre del jefe de Storage."
          onClick={() => go({ sec: 'discrepancias' })}
        />
        <OptionCard
          color={storage.color}
          icon="📈"
          title="Resultados y avance"
          description="Avance en vivo: LPN y unidades contadas, estado por SKU, exactitud y conteo por persona. Exporta el detalle a Excel (CSV)."
          onClick={() => go({ sec: 'resultados' })}
        />
      </div>
      {ops.data && ops.data.length === 0 ? (
        <p className="mt-4 text-sm text-white/45">
          {canManage ? 'Empieza en “Asignación de OPL” agregando el primer operador (ej. TLA).' : 'Todavía no hay operadores logísticos configurados.'}
        </p>
      ) : null}
    </div>
  )
}
