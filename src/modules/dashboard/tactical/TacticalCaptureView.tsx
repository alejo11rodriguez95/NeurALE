import { useEffect, useState, type ReactNode } from 'react'

import { useAuth } from '@/shared/auth/AuthContext'
import { canManageModule } from '@/shared/auth/RequireAccess'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, type ModuleId } from '@/shared/modules'

import { saveFillRateDaily, saveProcess, saveQuality, saveSafety, type FillRateDailyRow, type ProcessRow, type QualityRow } from './api'
import {
  SHORTAGE_CAUSES,
  currentShiftSV,
  enabledShifts,
  shiftHours,
  slotMode,
  goalFor,
  processForModule,
  qualityMetricsForModule,
  todaySV,
  type ProcessDef,
  type QualityMetric,
  type ShiftId,
} from './config'
import { computeBoard, fillRateDateFor, fmt, inboundCalc, inboundStaff, isNum, pct, stLimit, stRatio, type StorageSlot } from './metrics'
import { Button, Cell, Ratio, ShiftPicker, fieldClass, ringStyle } from './ui'
import { useTactical } from './useTactical'

/**
 * Opción "Diálogo Táctico" dentro de un módulo: el jefe de área llena la fila
 * de su proceso para el turno (Inbound, Storage, Picking, Outbound).
 * Picking además llena Fill Rate + causa del faltante. Algunos indicadores de
 * calidad los llena otro módulo (ver `QUALITY_METRICS`): Outbound → rechazos a
 * Picking; Inventory → ubicaciones erróneas (Storage) e inconsistencias en
 * sucursales (Outbound). Cualquier jefe puede registrar los incidentes / casi
 * accidentes / actos inseguros del turno.
 * Lo que se guarda aparece al instante en el tablero del Dashboard Neuronal.
 */
export function TacticalCaptureView({ moduleId }: { moduleId: ModuleId }) {
  const { adminUser } = useAuth()
  const mod = MODULES.find((m) => m.id === moduleId)!
  const proc = processForModule(moduleId)
  const qMetrics = qualityMetricsForModule(moduleId)
  const color = mod.color
  // 2026-09-29: además de admin/gerencia/jefe_area del módulo (de siempre),
  // un nivel de acceso con "editar" en este módulo también puede capturar —
  // ver ARCHITECTURE.md → "Niveles de acceso (catálogo dinámico)" →
  // "Ampliación 2026-09-29: acceso real dentro de cada módulo".
  const canEdit = canManageModule(adminUser, moduleId)

  const [date, setDate] = useState(todaySV)
  const [shift, setShift] = useState<ShiftId>(() => currentShiftSV())
  const { data, settings, error, reload } = useTactical(date, shift)
  const shiftCfg = settings?.goals.shifts
  // Si el turno elegido quedó deshabilitado en Ajustes → Turnos, salta al habilitado.
  useEffect(() => {
    if (shiftCfg && !shiftCfg[shift]?.enabled) setShift(shiftCfg.A.enabled ? 'A' : 'B')
  }, [shiftCfg, shift])

  if (!canEdit) {
    return (
      <GlassCard className="p-6 text-sm text-white/60">
        El Diálogo Táctico lo llena el jefe de área de {mod.label} (o gerencia). Si te toca capturarlo, pide que
        te asignen el nivel correspondiente en Configuraciones y Administradores.
      </GlassCard>
    )
  }

  if (!proc && qMetrics.length === 0) return null

  return (
    <div className="flex flex-col gap-5">
      <GlassCard className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">Diálogo Táctico · {mod.label}</h2>
          <p className="mt-1 max-w-xl text-sm text-white/55">
            Captura los datos de {mod.label} para el turno. Se reflejan al instante en el tablero del Dashboard
            Neuronal.
          </p>
        </div>
        <ShiftPicker
          date={date}
          shift={shift}
          onDate={setDate}
          onShift={setShift}
          color={color}
          shifts={shiftCfg ? enabledShifts(shiftCfg) : undefined}
        />
      </GlassCard>

      {error ? <p className="text-sm text-rose-300">Error: {error}</p> : null}
      {!data || !settings ? (
        <p className="text-sm text-white/45">{error ? '' : 'Cargando…'}</p>
      ) : (
        <>
          {proc ? (
            <ProcessForm
              key={`p-${date}-${shift}`}
              def={proc}
              row={data.processes[proc.id]}
              goal={goalFor(settings.goals, proc.id)}
              palletsPerContainer={settings.goals.g.palletsPerContainer}
              pickHours={settings.goals.g.pickHours}
              storage={data.storage}
              storagePct={settings.goals.g.storagePct}
              storageMode={slotMode(settings.goals.shifts)}
              isq={data.isq}
              isqMax={settings.goals.g.isqMax}
              color={color}
              onSave={async (v) => {
                await saveProcess({ shift_date: date, shift, process_id: proc.id }, v)
                reload()
              }}
            />
          ) : null}
          {qMetrics.length ? (
            <QualityForm
              key={`q-${date}-${shift}`}
              metrics={qMetrics.map((m) => ({ ...m, max: goalFor(settings.goals, m.row).metaErr }))}
              rows={data.quality}
              color={color}
              onSave={async (vals) => {
                for (const [metric, value] of Object.entries(vals))
                  await saveQuality({ shift_date: date, shift }, metric as QualityMetric, value)
                reload()
              }}
            />
          ) : null}
          {moduleId === 'picking' ? (
            <FillRateForm
              key={`f-${fillRateDateFor(date)}`}
              frDate={fillRateDateFor(date)}
              initial={data.fillRateDaily}
              goal={settings.goals.g.frSuc}
              color={color}
              onSave={async (v) => {
                await saveFillRateDaily(fillRateDateFor(date), v)
                reload()
              }}
            />
          ) : null}
          <SafetyForm
            key={`s-${date}-${shift}-${data.safety?.updated_at ?? ''}`}
            initial={data.safety}
            lti={computeBoard(data, settings, date).safety.lti}
            color={color}
            shiftLabel={`Turno ${shift} (${shiftHours(settings.goals.shifts, shift)})`}
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
  def,
  row,
  goal,
  palletsPerContainer,
  pickHours,
  storage,
  storagePct,
  storageMode,
  isq = null,
  isqMax = 0,
  color,
  onSave,
}: {
  def: ProcessDef
  row: ProcessRow | undefined
  goal: ReturnType<typeof goalFor>
  palletsPerContainer: number
  /** Picking: horas efectivas del turno (Ajustes → Metas). */
  pickHours: number
  /** Storage: plan/real automáticos de la casilla actual. */
  storage: StorageSlot | null
  storagePct: number
  storageMode: 'shift' | 'day'
  /** Inbound: incidencias ISQ del turno (solo lectura, las reporta Storage). */
  isq?: number | null
  isqMax?: number
  color: string
  onSave: (v: Partial<ProcessRow>) => Promise<void>
}) {
  const containers = !!def.containers
  const autoStorage = !!def.autoStorage
  const perPersonHour = !!def.perPersonHour
  // El indicador de calidad solo se captura aquí si lo llena el propio módulo.
  const ownErrors = !def.quality
  const staff0 = containers ? inboundStaff(row, goal) : null
  const [v, setV] = useState<Vals>(() => ({
    vol_plan: toStr(row?.vol_plan),
    vol_real: toStr(row?.vol_real),
    hh_direct: toStr(row?.hh_direct),
    staff_plan: toStr(row?.staff_plan ?? goal.dot),
    staff_present: toStr(row?.staff_present),
    rev_plan: toStr(staff0?.revPlan),
    rev_present: toStr(staff0?.revPresent),
    aux_plan: toStr(staff0?.auxPlan),
    aux_present: toStr(staff0?.auxPresent),
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
  const sum = (a: number | null, b: number | null) => (a === null && b === null ? null : (a ?? 0) + (b ?? 0))

  const { busy, save, status } = useSave(() => {
    const out: Partial<ProcessRow> = {
      equip_plan: toNum(v.equip_plan),
      equip_available: toNum(v.equip_available),
    }
    if (!autoStorage) {
      out.vol_plan = toNum(v.vol_plan)
      out.vol_real = toNum(v.vol_real)
    }
    if (!containers && !perPersonHour) out.hh_direct = toNum(v.hh_direct)
    if (containers) {
      const rp = toNum(v.rev_plan)
      const rr = toNum(v.rev_present)
      const ap = toNum(v.aux_plan)
      const ar = toNum(v.aux_present)
      out.staff_breakdown = { rev: { plan: rp, present: rr }, aux: { plan: ap, present: ar } }
      out.staff_plan = sum(rp, ap)
      out.staff_present = sum(rr, ar)
    } else {
      out.staff_plan = toNum(v.staff_plan)
      out.staff_present = toNum(v.staff_present)
    }
    if (ownErrors) out.errors = toNum(v.errors)
    return onSave(out)
  })

  const staffPlan = containers ? sum(n('rev_plan'), n('aux_plan')) : n('staff_plan')
  const staffPresent = containers ? sum(n('rev_present'), n('aux_present')) : n('staff_present')
  const volPlan = autoStorage ? (storage?.plan ?? null) : n('vol_plan')
  const volReal = autoStorage ? (storage?.real ?? null) : n('vol_real')
  const inbound = containers
    ? inboundCalc(n('vol_plan'), n('vol_real'), n('aux_present'), n('aux_plan'), palletsPerContainer)
    : null
  const prod = inbound
    ? inbound.perPerson
    : perPersonHour
      ? isNum(volReal) && isNum(staffPresent) && staffPresent! > 0 && pickHours > 0
        ? volReal! / staffPresent! / pickHours
        : null
      : isNum(volReal) && isNum(n('hh_direct')) && n('hh_direct')! > 0
        ? volReal! / n('hh_direct')!
        : null
  const metaProd = inbound ? inbound.metaPerPerson : goal.metaProd
  const u = goal.unidad
  const eq = def.transport ? 'Camiones' : 'Montacargas'
  const volPct = pct(volReal, volPlan)

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
      {autoStorage ? (
        <div className="mb-4 rounded-xl border border-neurale-border bg-white/5 p-4 text-sm text-white/70">
          <p className="mb-2 text-[11px] tracking-[0.18em] text-white/40 uppercase">
            Volumen automático · {storageMode === 'shift' ? 'turno a turno' : 'día a día'}
          </p>
          {storage ? (
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <span>
                {storagePct}% del plan de Inbound: <b className="text-white">{fmt(storage.inboundPart)}</b> pallets
              </span>
              <span>
                Pendiente {storageMode === 'shift' ? 'del turno anterior' : 'del día anterior'}:{' '}
                <b className="text-white">{fmt(storage.carry)}</b> pallets
              </span>
              <span>
                Plan: <b className="text-white">{fmt(storage.plan)}</b> pallets
              </span>
              <span>
                Reales (Registro x Pallet): <b className="text-white">{fmt(storage.real)}</b> pallets
              </span>
            </div>
          ) : (
            <p className="text-white/45">
              Todavía no se puede calcular: falta correr la migración de Registro x Pallet o no hay datos de Inbound.
            </p>
          )}
          <p className="mt-2 text-xs text-white/40">
            El plan sale solo del plan de Inbound y los pallets reales, de Storage → Registro x Pallet. No se capturan aquí.
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {containers ? (
          <>
            <Field label="Contenedores proyectados a recibir" value={v.vol_plan} onChange={set('vol_plan')} color={color} />
            <Field label="Contenedores recibidos" value={v.vol_real} onChange={set('vol_real')} color={color} />
          </>
        ) : autoStorage ? null : (
          <>
            <Field label={`Volumen plan (${u})`} value={v.vol_plan} onChange={set('vol_plan')} color={color} />
            <Field label={`Volumen real (${u})`} value={v.vol_real} onChange={set('vol_real')} color={color} />
          </>
        )}
        {!containers && !perPersonHour ? (
          <Field label="Horas-hombre trabajadas" value={v.hh_direct} onChange={set('hh_direct')} color={color} />
        ) : null}
        {ownErrors ? <Field label={def.err} value={v.errors} onChange={set('errors')} color={color} /> : null}
        {containers ? (
          <>
            <Field label="Revisadores plan" value={v.rev_plan} onChange={set('rev_plan')} color={color} />
            <Field label="Revisadores presentes" value={v.rev_present} onChange={set('rev_present')} color={color} />
            <Field label="Aux. de Descarga plan" value={v.aux_plan} onChange={set('aux_plan')} color={color} />
            <Field label="Aux. de Descarga presentes" value={v.aux_present} onChange={set('aux_present')} color={color} />
          </>
        ) : (
          <>
            <Field label="Dotación plan" value={v.staff_plan} onChange={set('staff_plan')} color={color} />
            <Field label="Presentes hoy" value={v.staff_present} onChange={set('staff_present')} color={color} />
          </>
        )}
        <Field label={`${eq} plan`} value={v.equip_plan} onChange={set('equip_plan')} color={color} />
        <Field label={`${eq} ${def.transport ? 'disponibles' : 'operativos'}`} value={v.equip_available} onChange={set('equip_available')} color={color} />
      </div>
      {containers ? (
        <p className="mt-3 text-xs text-white/40">
          En el tablero la dotación es la suma de los dos puestos; la productividad se calcula solo con los Aux. de Descarga.
        </p>
      ) : null}
      {perPersonHour ? (
        <p className="mt-3 text-xs text-white/40">
          Productividad = (líneas reales ÷ presentes) ÷ {fmt(pickHours)} horas efectivas (se cambia en Ajustes → Metas).
        </p>
      ) : null}
      {!ownErrors ? (
        <p className="mt-3 text-xs text-white/40">
          "{def.err}" no se captura aquí: lo llena{' '}
          {def.quality === 'pic_rejections' ? 'Outbound' : 'Inventory'} desde su opción Diálogo Táctico.
        </p>
      ) : null}
      {def.isq ? (
        <p className="mt-3 text-xs text-white/40">
          "ISQ" no se captura aquí: es el conteo automático de las incidencias Inbound-Storage Quality que Storage
          reporta en este turno (seguimiento en Inbound → ISQ).
        </p>
      ) : null}

      <p className="mt-5 mb-2 text-[11px] tracking-[0.18em] text-white/40 uppercase">Así se verá en el tablero</p>
      <div className={`grid grid-cols-2 gap-2 ${containers ? (def.isq ? 'sm:grid-cols-7' : 'sm:grid-cols-6') : ownErrors ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
        <Cell
          status={stRatio(volReal, volPlan)}
          label={containers ? 'Contenedores' : autoStorage ? 'Cumplimiento' : 'Real / plan'}
          value={
            autoStorage ? (
              volPct === null ? '—' : <>{fmt(volPct)}<span className="text-[0.55em] text-white/45">%</span></>
            ) : (
              <Ratio a={fmt(volReal)} b={fmt(volPlan)} />
            )
          }
          meta={
            autoStorage
              ? `${fmt(volReal)} / ${fmt(volPlan)} pallets`
              : volPct === null
                ? 'Sin dato'
                : `${fmt(volPct)}% del plan`
          }
        />
        {inbound ? (
          <Cell
            status={stRatio(inbound.palletsReal, inbound.palletsPlan)}
            label="Pallets aprox."
            value={<Ratio a={fmt(inbound.palletsReal)} b={fmt(inbound.palletsPlan)} />}
            meta={`${fmt(palletsPerContainer)} por contenedor`}
          />
        ) : null}
        <Cell
          status={stRatio(prod, metaProd)}
          label={containers ? 'Pallets por aux. descarga' : perPersonHour ? `${u} por persona/hora` : `${u} por HH`}
          value={fmt(prod)}
          meta={`Meta ${fmt(metaProd)}`}
        />
        <Cell
          status={stRatio(staffPresent, staffPlan)}
          label="Presentes / plan"
          value={<Ratio a={fmt(staffPresent)} b={fmt(staffPlan)} />}
          meta={containers ? `Rev ${fmt(n('rev_present'))} · Aux ${fmt(n('aux_present'))}` : undefined}
        />
        <Cell status={stRatio(n('equip_available'), n('equip_plan'))} label={`${eq} / plan`} value={<Ratio a={fmt(n('equip_available'))} b={fmt(n('equip_plan'))} />} />
        {ownErrors ? (
          <Cell status={stLimit(n('errors'), goal.metaErr)} label={def.err} value={fmt(n('errors'))} meta={`Máximo ${goal.metaErr}`} />
        ) : null}
        {def.isq ? (
          <Cell status={stLimit(isq, isqMax)} label="ISQ (de Storage)" value={fmt(isq)} meta={`Máximo ${isqMax} · automático`} />
        ) : null}
      </div>
    </Section>
  )
}

/* ---------- Calidad cruzada (Outbound → Picking; Inventory → Storage/Outbound) ---------- */

function QualityForm({
  metrics,
  rows,
  color,
  onSave,
}: {
  metrics: { id: QualityMetric; label: string; max: number }[]
  rows: Partial<Record<QualityMetric, QualityRow>>
  color: string
  onSave: (vals: Partial<Record<QualityMetric, number | null>>) => Promise<void>
}) {
  const [v, setV] = useState<Vals>(() => Object.fromEntries(metrics.map((m) => [m.id, toStr(rows[m.id]?.value)])))
  const { busy, save, status } = useSave(() =>
    onSave(Object.fromEntries(metrics.map((m) => [m.id, toNum(v[m.id])]))),
  )
  const last = metrics
    .map((m) => rows[m.id]?.updated_at)
    .filter(Boolean)
    .sort()
    .pop()
  const n = (k: string) => {
    try {
      return toNum(v[k])
    } catch {
      return null
    }
  }

  return (
    <Section
      title={metrics.length > 1 ? 'Indicadores de calidad que audita tu área' : 'Indicador de calidad que audita tu área'}
      subtitle={last ? `Última actualización: ${hhmm(last)}` : 'Aparecen en la columna Calidad de la fila correspondiente del tablero.'}
      footer={
        <>
          {status}
          <Button primary color={color} onClick={save} disabled={busy}>
            {busy ? 'Guardando…' : 'Guardar calidad'}
          </Button>
        </>
      }
    >
      <div className={`grid grid-cols-1 gap-3 ${metrics.length > 1 ? 'sm:grid-cols-[1fr_1fr_0.8fr_0.8fr]' : 'sm:grid-cols-[1fr_0.8fr]'}`}>
        {metrics.map((m) => (
          <Field key={m.id} label={m.label} value={v[m.id]} onChange={(x) => setV((p) => ({ ...p, [m.id]: x }))} color={color} />
        ))}
        {metrics.map((m) => (
          <Cell
            key={`c-${m.id}`}
            status={stLimit(n(m.id), m.max)}
            label={m.label}
            value={fmt(n(m.id))}
            meta={`Máximo ${m.max}`}
          />
        ))}
      </div>
    </Section>
  )
}

/* ---------- Fill Rate (solo Picking) ---------- */

function FillRateForm({
  frDate,
  initial,
  goal,
  color,
  onSave,
}: {
  /** Día al que corresponde el resultado (el día anterior a la fecha elegida). */
  frDate: string
  initial: FillRateDailyRow | null
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
      title={`Fill Rate sucursales · día anterior (${frDate.slice(8, 10)}/${frDate.slice(5, 7)})`}
      subtitle={
        <>
          Una vez al día: el resultado completo del {frDate.slice(8, 10)}/{frDate.slice(5, 7)}/{frDate.slice(0, 4)}. Se muestra en los dos
          turnos del tablero de hoy.
          {initial?.updated_at ? ` Última actualización: ${hhmm(initial.updated_at)}.` : ''}
        </>
      }
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
