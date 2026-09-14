import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'inventory')!

export default function InventoryModule() {
  return <ModulePlaceholder module={moduleDef} />
}
