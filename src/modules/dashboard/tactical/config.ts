import type { ModuleId } from '@/shared/modules'

/**
 * Diálogo Táctico CD Nneo — configuración estática (portada del HTML original
 * "Dialogo-Tactico-CD-Nneo_3.html"). Las metas editables viven en Supabase
 * (`dashboard_tactical_settings.goals`); aquí solo quedan los valores por
 * defecto y los catálogos fijos.
 */

export type ProcessId = 'rec' | 'alm' | 'pic' | 'des'
export type ShiftId = 'A' | 'B'

export interface ProcessDef {
  id: ProcessId
  nombre: string
  /** Etiqueta del indicador de calidad de este proceso. */
  err: string
  /** Módulo de NeurALE que llena esta fila del diálogo. */
  module: ModuleId
  /** Despacho usa "camiones" en vez de "montacargas". */
  transport?: boolean
}

export const PROCESSES: ProcessDef[] = [
  { id: 'rec', nombre: 'Recepción', err: 'Diferencias vs. OC', module: 'inbound' },
  { id: 'alm', nombre: 'Almacenamiento', err: 'Ubicaciones erróneas', module: 'storage' },
  { id: 'pic', nombre: 'Picking', err: 'Errores de picking', module: 'picking' },
  { id: 'des', nombre: 'Despacho', err: 'Rechazos', module: 'outbound', transport: true },
]

export function processForModule(module: string | null | undefined): ProcessDef | undefined {
  return PROCESSES.find((p) => p.module === module)
}

export const SHIFTS: { id: ShiftId; hours: string }[] = [
  { id: 'A', hours: '06:00–14:00' },
  { id: 'B', hours: '14:00–22:00' },
]

export interface ProcessGoal {
  id: ProcessId
  unidad: string
  metaProd: number
  metaErr: number
  dot: number
  mc: number
}

export interface Goals {
  procesos: ProcessGoal[]
  g: { frSuc: number; s5: number; preop: number }
}

export const DEFAULT_GOALS: Goals = {
  procesos: [
    { id: 'rec', unidad: 'pallets', metaProd: 6, metaErr: 0, dot: 8, mc: 3 },
    { id: 'alm', unidad: 'ubicaciones', metaProd: 10, metaErr: 0, dot: 6, mc: 4 },
    { id: 'pic', unidad: 'líneas', metaProd: 45, metaErr: 2, dot: 18, mc: 3 },
    { id: 'des', unidad: 'pallets', metaProd: 8, metaErr: 0, dot: 10, mc: 3 },
  ],
  g: { frSuc: 90, s5: 90, preop: 100 },
}

/** Mezcla las metas guardadas con los valores por defecto (tolera jsonb incompleto). */
export function normalizeGoals(raw: unknown): Goals {
  const r = (raw ?? {}) as Partial<Goals>
  return {
    procesos: DEFAULT_GOALS.procesos.map((d) => ({
      ...d,
      ...(r.procesos ?? []).find((p) => p?.id === d.id),
    })),
    g: { ...DEFAULT_GOALS.g, ...r.g },
  }
}

export function goalFor(goals: Goals, id: ProcessId): ProcessGoal {
  return goals.procesos.find((p) => p.id === id) ?? DEFAULT_GOALS.procesos.find((p) => p.id === id)!
}

export const SHORTAGE_CAUSES = [
  'Sin existencia en sistema',
  'Diferencia de inventario (sistema ≠ físico)',
  'Producto no ubicado',
  'Capacidad del turno',
  'Pedido tardío',
  'Daño / merma',
  'Otra',
]

/* ---------- Housekeeping · checklist ponderado (peso 3 = crítico) ---------- */

export type HkValue = 'c' | 'p' | 'n' | 'x'

export const HK: { z: string; i: [string, string, 1 | 2 | 3][] }[] = [
  {
    z: 'Pasillos y áreas comunes',
    i: [
      ['g1', 'Pasillos de montacargas despejados: sin producto, tarimas ni equipos detenidos', 3],
      ['g2', 'Rutas peatonales y cruces señalizados, pintura visible y libres de obstáculos', 3],
      ['g3', 'Salidas de emergencia, extintores, gabinetes y lavaojos sin obstrucción', 3],
      ['g4', 'Piso sin derrames, aceite, vidrio roto, clavos ni flejes', 3],
      ['g5', 'Stretch film, cartón y basura recolectados en contenedores identificados', 2],
      ['g6', 'Iluminación funcionando en pasillos y andenes', 1],
    ],
  },
  {
    z: 'Recepción',
    i: [
      ['r1', 'Andenes y área de descarga libres al cierre del turno', 2],
      ['r2', 'Mercadería recibida identificada; nada en piso sin estatus en WIS', 2],
      ['r3', 'Tarimas vacías apiladas en zona designada y a la altura máxima permitida', 2],
      ['r4', 'Zona de devoluciones y cuarentena delimitada y ordenada', 1],
    ],
  },
  {
    z: 'Almacenamiento',
    i: [
      ['a1', 'Racks sin daños visibles; daños reportados y señalizados', 3],
      ['a2', 'Pallets bien asentados, sin sobresalir de la viga ni exceder capacidad', 3],
      ['a3', 'Vidrio y producto frágil en su zona designada, con protección y sin sobrecarga', 3],
      ['a4', 'Sin producto en ubicaciones no asignadas ni en pasillos de rack', 2],
      ['a5', 'Etiquetas de ubicación legibles y completas', 1],
    ],
  },
  {
    z: 'Picking',
    i: [
      ['p1', 'Frentes de picking abastecidos, ordenados y sin cajas abiertas en el piso', 2],
      ['p2', 'Producto dañado o merma separado e identificado', 2],
      ['p3', 'Carretillas, jaulas y herramientas guardadas en su lugar', 1],
    ],
  },
  {
    z: 'Despacho',
    i: [
      ['d1', 'Pedidos preparados en carriles de salida identificados por ruta', 2],
      ['d2', 'Carriles sin mezcla de rutas ni pedidos sin etiquetar', 2],
      ['d3', 'Área de carga libre al salir cada camión', 1],
    ],
  },
  {
    z: 'Equipos y baterías',
    i: [
      ['e1', 'Montacargas estacionados en zona designada, horquillas abajo y llave retirada', 3],
      ['e2', 'Zona de carga de baterías limpia, ventilada y sin materiales ajenos', 3],
      ['e3', 'Transpaletas y equipos manuales en su posición asignada', 1],
    ],
  },
]

/* ---------- Fechas en hora de El Salvador ---------- */

const TZ = 'America/El_Salvador'

/** Fecha de hoy (YYYY-MM-DD) en hora de El Salvador, sin importar la zona del equipo. */
export function todaySV(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Turno en curso según la hora de El Salvador (antes de las 14:00 = A). */
export function currentShiftSV(now = new Date()): ShiftId {
  const h = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(now),
  )
  return h < 14 ? 'A' : 'B'
}

/** Días completos entre dos fechas YYYY-MM-DD (b − a). */
export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
  return Math.round((db - da) / 86_400_000)
}

/** Resta N días a una fecha YYYY-MM-DD. */
export function addDays(date: string, n: number): string {
  const d = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function isoWeek(date: string): number {
  const t = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)))
  const n = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - n)
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y.getTime()) / 86_400_000 + 1) / 7)
}
