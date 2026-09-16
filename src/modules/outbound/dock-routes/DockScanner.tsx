import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'

import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES } from '@/shared/modules'

const moduleDef = MODULES.find((m) => m.id === 'outbound')!

/**
 * Cámara para escanear el QR de un muelle. Usa `qr-scanner` (corre en un
 * WebWorker). Requiere HTTPS o localhost y permiso de cámara del navegador.
 */
export function DockScanner({
  onScan,
  onCancel,
}: {
  onScan: (text: string) => void
  onCancel: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!videoRef.current) return

    const scanner = new QrScanner(
      videoRef.current,
      (result) => {
        scanner.stop()
        onScan(result.data.trim())
      },
      { highlightScanRegion: true, highlightCodeOutline: true },
    )
    scannerRef.current = scanner

    scanner.start().catch(() => {
      setError('No se pudo acceder a la cámara. Revisa los permisos del navegador.')
    })

    return () => {
      scanner.stop()
      scanner.destroy()
      scannerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <GlassCard className="p-6" style={{ borderColor: moduleDef.color }}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-white">
          Escanea el QR del muelle
        </h3>
        <button
          onClick={onCancel}
          className="rounded-full border border-neurale-border px-3 py-1 text-xs text-white/70"
        >
          Cancelar
        </button>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-400">{error}</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl bg-black">
          <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
        </div>
      )}
    </GlassCard>
  )
}
