import { ModulePlaceholder } from '@/shared/components/ModulePlaceholder'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'storage')!

export default function StorageModule() {
  return <ModulePlaceholder module={moduleDef} />
}
