import { GlassCard } from '@/shared/components/GlassCard'
import { ModuleScreen } from '@/shared/components/ModuleScreen'
import { withAlpha, type AnyModuleId, type ModuleDef } from '@/shared/modules'

/**
 * Pantalla de espera para un módulo que todavía no tiene contenido de negocio.
 * Cada módulo la reemplaza en su propio chat, conservando `ModuleScreen` como
 * carcasa para heredar el fondo, el encabezado y el color del módulo.
 */
export function ModulePlaceholder({
  module,
}: {
  module: ModuleDef<AnyModuleId>
}) {
  return (
    <ModuleScreen module={module}>
      <GlassCard
        className="p-8"
        style={{ borderColor: withAlpha(module.color, 0.22) }}
      >
        <p className="text-sm leading-relaxed text-white/55">
          Esta región neuronal todavía no tiene pantallas de negocio. Se
          construyen en el chat propio de{' '}
          <span style={{ color: module.color }}>{module.label}</span>, dentro del
          proyecto NeurALE, sobre la base y el sistema de diseño creados en el
          chat de Setup y Diseño.
        </p>
      </GlassCard>
    </ModuleScreen>
  )
}
