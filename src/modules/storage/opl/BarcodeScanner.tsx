import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Lector de código de barras / QR con la cámara del celular (Auditoría OPL).
 *
 * - Chrome en Android: usa el lector nativo del navegador (`BarcodeDetector`),
 *   rápido y sin descargar nada.
 * - iPhone y navegadores sin lector nativo: carga `@zxing/browser` bajo demanda.
 * - La cámara solo funciona en https (producción en Vercel lo es) y pide permiso
 *   la primera vez.
 *
 * Se monta con `createPortal` en `document.body` porque `.neural-enter`
 * (PageTransition) deja un `transform` que atrapa `position: fixed` (ver
 * ARCHITECTURE.md → "Interior de los módulos").
 */

const FORMATS = ['code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e', 'qr_code', 'data_matrix']

interface DetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}
type DetectorCtor = { new (o: { formats: string[] }): DetectorLike; getSupportedFormats?: () => Promise<string[]> }

export function BarcodeScanner({
  onDetected,
  onClose,
  title = 'Escanear código',
  color,
}: {
  onDetected: (code: string) => void
  onClose: () => void
  title?: string
  color: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<string>('Iniciando cámara…')
  const doneRef = useRef(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopZxing: (() => void) | null = null
    let alive = true

    const finish = (code: string) => {
      if (doneRef.current || !code.trim()) return
      doneRef.current = true
      try {
        navigator.vibrate?.(80)
      } catch {
        /* sin vibración */
      }
      onDetected(code.trim())
    }

    async function startNative(Ctor: DetectorCtor): Promise<boolean> {
      const supported = (await Ctor.getSupportedFormats?.().catch(() => [])) ?? []
      const formats = FORMATS.filter((f) => supported.includes(f))
      if (!formats.length) return false
      const detector = new Ctor({ formats })
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      const v = videoRef.current!
      v.srcObject = stream
      await v.play()
      setEngine('Apunta al código de barras')
      let last = 0
      const tick = async (t: number) => {
        if (!alive || doneRef.current) return
        if (t - last > 120 && v.readyState >= 2) {
          last = t
          try {
            const codes = await detector.detect(v)
            if (codes[0]?.rawValue) return finish(codes[0].rawValue)
          } catch {
            /* frame no legible */
          }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return true
    }

    async function startZxing() {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        videoRef.current!,
        (result) => {
          if (result) finish(result.getText())
        },
      )
      stopZxing = () => controls.stop()
      if (!alive) controls.stop()
      setEngine('Apunta al código de barras')
    }

    ;(async () => {
      // Espera un tick: en desarrollo (StrictMode) el efecto se monta dos veces y
      // la primera corrida no debe tomar la cámara (su limpieza le quitaría el video a la segunda).
      await new Promise((r) => setTimeout(r, 0))
      if (!alive) return
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara (se necesita https).')
        const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
        const ok = Ctor ? await startNative(Ctor).catch(() => false) : false
        if (!ok && alive) await startZxing()
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(
          /Permission|NotAllowed/i.test(msg)
            ? 'No hay permiso para usar la cámara. Actívalo en la configuración del navegador para este sitio.'
            : `No se pudo abrir la cámara: ${msg}`,
        )
      }
    })()

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      stopZxing?.()
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="font-display text-base font-semibold text-white">{title}</span>
        <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-4 py-1.5 text-sm text-white/80">
          Cerrar
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
        {!error ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-[80%] max-w-md rounded-2xl border-2" style={{ borderColor: color, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
          </div>
        ) : null}
      </div>
      <div className="px-4 py-4 text-center text-sm text-white/70">{error ? <span className="text-rose-300">{error}</span> : engine}</div>
    </div>,
    document.body,
  )
}
