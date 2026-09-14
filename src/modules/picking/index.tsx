import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'picking')!

export default function PickingModule() {
  return <ModulePlaceholder module={moduleDef} />
}
