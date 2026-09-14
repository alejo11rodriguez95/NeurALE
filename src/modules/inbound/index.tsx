import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'inbound')!

export default function InboundModule() {
  return <ModulePlaceholder module={moduleDef} />
}
