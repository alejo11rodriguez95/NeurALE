import QRCode from 'qrcode'
import { useEffect, useRef } from 'react'

/**
 * QR imprimible de un muelle. El contenido del QR es simplemente el `code`
 * del muelle (ej. "M3") — se pega/imprime junto a la puerta del muelle.
 * Fondo blanco fijo (no sigue el tema oscuro) para que la cámara lo lea bien.
 */
export function DockQrCode({ code, label }: { code: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, code, {
      width: 168,
      margin: 1,
      color: { dark: '#05070d', light: '#ffffff' },
    }).catch(() => {
      /* si falla, el canvas simplemente queda vacío */
    })
  }, [code])

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-3">
      <canvas ref={canvasRef} />
      <span className="font-display text-sm font-semibold text-neurale-bg">{label}</span>
    </div>
  )
}
