import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

export default function OutboundModule() {
  return <ModulePlaceholder module={moduleDef} />
}
