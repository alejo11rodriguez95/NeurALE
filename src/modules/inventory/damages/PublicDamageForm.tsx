import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { GlassCard } from '@/shared/components/GlassCard'
import { ModuleScreen } from '@/shared/components/ModuleScreen'

import {
  DAMAGE_NAME,
  fetchPublicForm,
  lookupEmployee,
  reportFolio,
  submitDamageReport,
  type PublicEmployee,
} from './lib/damages'
import {
  COLOR,
  ErrorText,
  GhostButton,
  PrimaryButton,
  YesNo,
  errMsg,
  fieldControlClass,
  fieldLabelClass,
  inventory,
  ringStyle,
} from './ui'

const CODE_KEY = 'neurale:averias:employee-code'

function readSavedCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code)
  } catch {
    /* sin almacenamiento: no pasa nada, solo no se recuerda */
  }
}

/**
 * Formulario público que abre el QR de Control de Averías (ruta
 * `/averias?t=<token>`, fuera de `RequireAccess`: no pide iniciar sesión).
 * El colaborador se identifica con su código de empleado; la base valida el
 * token del QR y que el empleado exista y esté activo. Todos los campos son
 * obligatorios.
 */
export default function PublicDamageForm() {
  const [params] = useSearchParams()
  const token = params.get('t') ?? ''
  const [state, setState] = useState<'loading' | 'invalid' | 'ready'>('loading')
  const [origins, setOrigins] = useState<{ id: string; name: string }[]>([])

  const [code, setCode] = useState(readSavedCode)
  const [employee, setEmployee] = useState<PublicEmployee | null>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [codeError, setCodeError] = useState<string | null>(null)

  const [originId, setOriginId] = useState('')
  const [sku, setSku] = useState('')
  const [qty, setQty] = useState('')
  const [deducted, setDeducted] = useState<boolean | null>(null)
  const [observation, setObservation] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const ring = ringStyle(COLOR)

  useEffect(() => {
    if (!token) return setState('invalid')
    fetchPublicForm(token)
      .then((r) => {
        setOrigins(r.origins)
        setState(r.ok ? 'ready' : 'invalid')
      })
      .catch(() => setState('invalid'))
  }, [token])

  // Si el código ya estaba guardado en este celular, se valida solo.
  useEffect(() => {
    if (state === 'ready' && code && !employee) void verifyCode(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  async function verifyCode(value: string) {
    const c = value.trim()
    if (!c) return
    setLookingUp(true)
    setCodeError(null)
    try {
      const e = await lookupEmployee(token, c)
      setEmployee(e)
      if (e) saveCode(e.employee_code)
      else setCodeError('Código no encontrado o inactivo. Revisa tu código de empleado.')
    } catch (e) {
      setCodeError(errMsg(e))
    } finally {
      setLookingUp(false)
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setError(null)
    const q = Number(qty)
    if (!employee) return setError('Valida tu código de empleado.')
    if (!originId) return setError('Selecciona el origen de la avería.')
    if (!sku.trim()) return setError('Escribe el SKU.')
    if (!Number.isInteger(q) || q <= 0) return setError('La cantidad debe ser un número entero mayor que 0.')
    if (deducted === null) return setError('Confirma si se descontó de la existencia de la ubicación.')
    if (!observation.trim()) return setError('Escribe una observación.')
    setSaving(true)
    try {
      const folio = await submitDamageReport(token, {
        employee_code: employee.employee_code,
        origin_id: originId,
        sku,
        quantity: q,
        deducted,
        observation,
      })
      setDone(folio)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  /** Otra avería: conserva colaborador y origen (lo usual es reportar varias seguidas). */
  function another() {
    setSku('')
    setQty('')
    setDeducted(null)
    setObservation('')
    setDone(null)
    setError(null)
  }

  return (
    <ModuleScreen module={inventory}>
      <div className="mx-auto max-w-lg">
        <GlassCard className="p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-white">Reportar avería</h2>
          <p className="mt-1 text-sm text-white/50">{DAMAGE_NAME} · CD NNEO. Todos los campos son obligatorios.</p>

          {state === 'loading' ? <p className="mt-6 text-sm text-white/50">Cargando…</p> : null}

          {state === 'invalid' ? (
            <p className="mt-6 text-sm text-[#f87171]">
              Este código QR ya no es válido. Pide a Inventory el QR vigente del área.
            </p>
          ) : null}

          {state === 'ready' && done !== null ? (
            <div className="mt-6 space-y-4 text-center">
              <p className="font-display text-3xl font-semibold" style={{ color: COLOR }}>
                {reportFolio(done)}
              </p>
              <p className="text-sm text-white/70">Avería registrada. Inventory la trabajará con las demás pendientes.</p>
              <div className="flex justify-center gap-2">
                <PrimaryButton color={COLOR} onClick={another}>
                  Reportar otra
                </PrimaryButton>
              </div>
            </div>
          ) : null}

          {state === 'ready' && done === null ? (
            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <label className="block">
                <span className={fieldLabelClass}>Colaborador que reporta (código de empleado)</span>
                <div className="flex gap-2">
                  <input
                    className={fieldControlClass}
                    style={ring}
                    value={code}
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="Ej. 10234"
                    onChange={(e) => {
                      setCode(e.target.value)
                      setEmployee(null)
                    }}
                    onBlur={() => !employee && verifyCode(code)}
                  />
                  <GhostButton className="mt-1.5 shrink-0" disabled={lookingUp || !code.trim()} onClick={() => verifyCode(code)}>
                    {lookingUp ? '…' : 'Validar'}
                  </GhostButton>
                </div>
                {employee ? (
                  <span className="mt-1.5 block text-sm" style={{ color: '#34d399' }}>
                    ✓ {employee.full_name}
                  </span>
                ) : null}
                <ErrorText>{codeError}</ErrorText>
              </label>

              <label className="block">
                <span className={fieldLabelClass}>Origen de la avería (departamento o área)</span>
                <select className={`${fieldControlClass} [color-scheme:dark]`} style={ring} value={originId} onChange={(e) => setOriginId(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {origins.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block">
                  <span className={fieldLabelClass}>SKU</span>
                  <input
                    className={`${fieldControlClass} uppercase`}
                    style={ring}
                    value={sku}
                    maxLength={60}
                    autoCapitalize="characters"
                    autoComplete="off"
                    onChange={(e) => setSku(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className={fieldLabelClass}>Cantidad</span>
                  <input
                    className={fieldControlClass}
                    style={ring}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </label>
              </div>

              <div>
                <span className={fieldLabelClass}>¿Se descontó de la existencia de la ubicación?</span>
                <YesNo value={deducted} onChange={setDeducted} />
              </div>

              <label className="block">
                <span className={fieldLabelClass}>Observación</span>
                <textarea
                  className={fieldControlClass}
                  style={ring}
                  rows={3}
                  maxLength={1000}
                  placeholder="Qué pasó, dónde está la avería, estado del producto…"
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                />
              </label>

              <ErrorText>{error}</ErrorText>

              <PrimaryButton color={COLOR} type="submit" disabled={saving} className="w-full py-3 text-base">
                {saving ? 'Enviando…' : 'Registrar avería'}
              </PrimaryButton>
            </form>
          ) : null}
        </GlassCard>
      </div>
    </ModuleScreen>
  )
}
