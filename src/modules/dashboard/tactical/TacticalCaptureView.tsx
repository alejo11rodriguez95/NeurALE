import { useEffect, useState, type ReactNode } from 'react'

import { useAuth } from '@/shared/auth/AuthContext'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, type ModuleId } from '@/shared/modules'

import { saveFillRate, saveProcess, saveSafety, type ProcessRow } from './api'
import { SHORTAGE_CAUSES, SHIFTS, currentShiftSV, goalFor, processForModule, todaySV, type ShiftId } from './config'
import { computeBoard, fmt, isNum, pct, stLimit, stRatio } from './metrics'
import { Button, Cell, Ratio, ShiftPicker, fieldClass, ringStyle } from './ui'
import { useTactical } from './useTactical'

/**
 * Opción "Diálogo Táctico" dentro de un módulo (Inbound, Storage, Picking,
 * Outbound): el jefe de área llena la fila de su proceso para el turno.
 * Picking además llena Fill Rate + causa del faltante. Cualquier jefe puede
 * registrar los incidentes / casi accidentes / actos inseguros del turno.
 * Lo que se guarda aparece al instante en el tablero del Dashboard Neuronal.
 */
export function TacticalCaptureView({ moduleId }: { moduleId: ModuleId }) {
  const { adminUser } = useAuth()
  const mod = MODULES.find((m) => m.id === moduleId)!
  const proc = processForModule(moduleId)
  const color = mod.color
  const isManager = adminUser?.access_level === 'admin' || adminUser?.access_level === 'gerencia'
  const canEdit = isManager || (adminUser?.access_level === 'jefe_area' && adminUser.module === moduleId)

  const [date, setDate] = useState(todaySV)
  const [shift, setShift] = useState<ShiftId>(currentShiftSV)
  const { data, settings, error, reload } = useTactical(date, shift)

  if (!canEdit) {
    return (
      <GlassCard className="p-6 text-sm text-white/60">
        El Diálogo Táctico lo llena el jefe de área de {mod.label} (o gerencia). Si te toca capturarlo, pide que
        te asignen el nivel correspondiente en Configuraciones y Administradores.
      </GlassCard>
    )
  }

  if (!proc) return null

  return (
    <div className="flex flex-col gap-5">
      <GlassCard className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">Diálogo Táctico · {proc.nombre}</h2>
          <p className="mt-1 max-w-xl text-sm text-white/55">
            Captura los datos de tu proceso para el turno. Se reflejan al instante en el tablero del Dashboard
            Neuronal.
          </p>
        </div>
        <ShiftPicker date={date} shift={shift} onDate={setDate} onShift={setShift} color={color} />
      </GlassCard>

      {error ? <p className="text-sm text-rose-300">Error: {error}</p> : null}
      {!data || !settings ? (
        <p className="text-sm text-white/45">{error ? '' : 'Cargando…'}</p>
      ) : (
        <>
          <ProcessForm
            key={`p-${date}-${shift}`}
            row={data.processes[proc.id]}
            goal={goalFor(settings.goals, proc.id)}
            transport={!!proc.transport}
            errLabel={proc.err}
            color={color}
            onSave={async (v) => {
              await saveProcess({ shift_date: date, shift, process_id: proc.id }, v)
              reload()
            }}
          />
          {moduleId === 'picking' ? (
            <FillRateForm
              key={`f-${date}-${shift}`}
              initial={data.fillRate}
              goal={settings.goals.g.frSuc}
              color={color}
              onSave={async (v) => {
                await saveFillRate({ shift_date: date, shift }, v)
                reload()
              }}
            />
          ) : null}
          <SafetyForm
            key={`s-${date}-${shift}-${data.safety?.updated_at ?? ''}`}
            initial={data.safety}
            lti={computeBoard(data, settings, date).safety.lti}
            color={color}
            shiftLabel={`Turno ${shift} (${SHIFTS.find((s) => s.id === shift)?.hours})`}
            onSave={async (v) => {
              await saveSafety({ shift_date: date, shift }, v)
              reload()
            }}
          />
        </>
      )}
    </div>
  )
}

/* ---------- Helpers de formulario ---------- */

type Vals = Record<string, string>
const toStr = (x: number | null | undefined) => (isNum(x) ? String(x) : '')
const toNum = (s: string) => {
  const t = s.replace(',', '.').trim()
  if (t === '') return null
  const n = Number(t)
  if (Number.isNaN(n) || n < 0) throw new Error('Revisa los valores: solo números positivos.')
  return n
}

function Field({
  label,
  value,
  onChange,
  color,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  color: string
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-white/55">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        placeholder={hint}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldClass} font-display text-lg tabular-nums`}
        style={ringStyle(color)}
      />
    </label>
  )
}

function Section({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <GlassCard className="p-5">
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-xs text-white/45">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">{footer}</div>
    </GlassCard>
  )
}

function useSave(onSave: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (!msg?.ok) return
    const t = setTimeout(() => setMsg(null), 2500)
    return () => clearTimeout(t)
  }, [msg])
  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await onSave()
      setMsg({ ok: true, text: 'Guardado' })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const status = msg ? <span className={`text-sm ${msg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</span> : null
  return { busy, save, status }
}

const hhmm = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('es-SV', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/El_Salvador' })
    : null

/* ---------- Fila del proceso ---------- */

function ProcessForm({
  row,
  goal,
  transport,
  errLabel,
  color,
  onSave,
}: {
  row: ProcessRow | undefined
  goal: ReturnType<typeof goalFor>
  transport: boolean
  errLabel: string
  color: string
  onSave: (v: Partial<ProcessRow>) => Promise<void>
}) {
  const [v, setV] = useState<Vals>(() => ({
    vol_plan: toStr(row?.vol_plan),
    vol_real: toStr(row?.vol_real),
    hh_direct: toStr(row?.hh_direct),
    staff_plan: toStr(row?.staff_plan ?? goal.dot),
    staff_present: toStr(row?.staff_present),
    equip_plan: toStr(row?.equip_plan ?? goal.mc),
    equip_available: toStr(row?.equip_available),
    errors: toStr(row?.errors),
  }))
  const set = (k: string) => (x: string) => setV((p) => ({ ...p, [k]: x }))
  const n = (k: string) => {
    try {
      return toNum(v[k])
    } catch {
      return null
    }
  }
  const { busy, save, status } = useSave(() =>
    onSave(Object.fromEntries(Object.entries(v).map(([k, s]) => [k, toNum(s)])) as Partial<ProcessRow>),
  )

  const prod = isNum(n('vol_real')) && isNum(n('hh_direct')) && n('hh_direct')! > 0 ? n('vol_real')! / n('hh_direct')! : null
  const u = goal.unidad
  const eq = transport ? 'Camiones' : 'Montacargas'

  return (
    <Section
      title={`Mi proceso · ${u}`}
      subtitle={row?.updated_at ? `Última actualización: ${hhmm(row.updated_at)}` : 'Todavía no hay captura para este turno.'}
      footer={
        <>
          {status}
          <Button primary color={color} onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar mi proceso'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={`Volumen plan (${u})`} value={v.vol_plan} onChange={set('vol_plan')} color={color} />
        <Field label={`Volumen real (${u})`} value={v.vol_real} onChange={set('vol_real')} color={color} />
        <Field label="Horas-hombre trabajadas" value={v.hh_direct} onChange={set('hh_direct')} color={color} />
        <Field label={errLabel} value={v.errors} onChange={set('errors')} color={color} />
        <Field label="Dotación plan" value={v.staff_plan} onChange={set('staff_plan')} color={color} />
        <Field label="Presentes hoy" value={v.staff_present} onChange={set('staff_present')} color={color} />
        <Field label={`${eq} plan`} value={v.equip_plan} onChange={set('equip_plan')} color={color} />
        <Field label={`${eq} ${transport ? 'disponibles' : 'operativos'}`} value={v.equip_available} onChange={set('equip_available')} color={color} />
      </div>

      <p className="mt-5 mb-2 text-[11px] tracking-[0.18em] text-white/40 uppercase">Así se verá en el tablero</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Cell
          status={stRatio(n('vol_real'), n('vol_plan'))}
          label="Real / plan"
          value={<Ratio a={fmt(n('vol_real'))} b={fmt(n('vol_plan'))} />}
          meta={pct(n('vol_real'), n('vol_plan')) === null ? 'Sin dato' : `${fmt(pct(n('vol_real'), n('vol_plan')))}% del plan`}
        />
        <Cell status={stRatio(prod, goal.metaProd)} label={`${u} por HH`} value={fmt(prod)} meta={`Meta ${fmt(goal.metaProd)}`} />
        <Cell status={stRatio(n('staff_present'), n('staff_plan'))} label="Presentes / plan" value={<Ratio a={fmt(n('staff_present'))} b={fmt(n('staff_plan'))} />} />
        <Cell status={stRatio(n('equip_available'), n('equip_plan'))} label={`${eq} / plan`} value={<Ratio a={fmt(n('equip_available'))} b={fmt(n('equip_plan'))} />} />
        <Cell status={stLimit(n('errors'), goal.metaErr)} label={errLabel} value={fmt(n('errors'))} meta={`Máximo ${goal.metaErr}`} />
      </div>
    </Section>
  )
}

/* ---------- Fill Rate (solo Picking) ---------- */

function FillRateForm({
  initial,
  goal,
  color,
  onSave,
}: {
  initial: { lines_requested: number | null; lines_dispatched: number | null; shortage_cause: string | null; updated_at?: string } | null
  goal: number
  color: string
  onSave: (v: { lines_requested: number | null; lines_dispatched: number | null; shortage_cause: string | null }) => Promise<void>
}) {
  const [req, setReq] = useState(toStr(initial?.lines_requested))
  const [dis, setDis] = useState(toStr(initial?.lines_dispatched))
  const [cause, setCause] = useState(initial?.shortage_cause ?? '')
  const { busy, save, status } = useSave(async () => {
    const r = toNum(req)
    const d = toNum(dis)
    if (r !== null && d !== null && d > r) throw new Error('Las líneas despachadas no pueden ser más que las solicitadas.')
    await onSave({ lines_requested: r, lines_dispatched: d, shortage_cause: cause || null })
  })
  let fr: number | null = null
  try {
    fr = pct(toNum(dis), toNum(req))
  } catch {
    fr = null
  }

  return (
    <Section
      title="Fill Rate sucursales"
      subtitle={initial?.updated_at ? `Última actualización: ${hhmm(initial.updated_at)}` : 'Resultado al cliente · lo llena Picking.'}
      footer={
        <>
          {status}
          <Button primary color={color} onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar fill rate'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1.4fr_1fr]">
        <Field label="Líneas solicitadas" value={req} onChange={setReq} color={color} />
        <Field label="Líneas despachadas" value={dis} onChange={setDis} color={color} />
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-white/55">Causa principal del faltante</span>
          <select
            value={cause}
            onChange={(e) => setCause(e.target.value)}
            className={`${fieldClass} min-h-[46px] [color-scheme:dark]`}
            style={ringStyle(color)}
          >
            <option value="">Seleccionar…</option>
            {SHORTAGE_CAUSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Cell status={stRatio(fr, goal)} label="Fill rate" value={fr === null ? '—' : `${fmt(fr)}%`} meta={`Meta ${goal}%`} />
      </div>
    </Section>
  )
}

/* ---------- Seguridad del turno ---------- */

function SafetyForm({
  initial,
  lti,
  color,
  shiftLabel,
  onSave,
}: {
  initial: { incidents: number; near_misses: number; unsafe_acts: number; updated_at?: string } | null
  lti: number | null
  color: string
  shiftLabel: string
  onSave: (v: { incidents: number; near_misses: number; unsafe_acts: number }) => Promise<void>
}) {
  const [v, setV] = useState<Vals>({
    incidents: String(initial?.incidents ?? 0),
    near_misses: String(initial?.near_misses ?? 0),
    unsafe_acts: String(initial?.unsafe_acts ?? 0),
  })
  const set = (k: string) => (x: string) => setV((p) => ({ ...p, [k]: x }))
  const { busy, save, status } = useSave(() =>
    onSave({
      incidents: Math.round(toNum(v.incidents) ?? 0),
      near_misses: Math.round(toNum(v.near_misses) ?? 0),
      unsafe_acts: Math.round(toNum(v.unsafe_acts) ?? 0),
    }),
  )

  return (
    <Section
      title="Seguridad del turno"
      subtitle={
        <>
          {shiftLabel} · inicia en 0. Los días sin accidentes ({fmt(lti)}) solo los modifica gerencia.
          {initial?.updated_at ? ` Última actualización: ${hhmm(initial.updated_at)}` : ''}
        </>
      }
      footer={
        <>
          {status}
          <Button primary color={color} onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar seguridad'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Accidentes / incidentes" value={v.incidents} onChange={set('incidents')} color={color} />
        <Field label="Casi accidentes" value={v.near_misses} onChange={set('near_misses')} color={color} />
        <Field label="Actos / condiciones inseguras" value={v.unsafe_acts} onChange={set('unsafe_acts')} color={color} />
      </div>
      <p className="mt-3 text-xs text-white/40">
        Es un total del turno compartido por todas las áreas: suma lo de tu área a lo que ya esté registrado.
      </p>
    </Section>
  )
}
