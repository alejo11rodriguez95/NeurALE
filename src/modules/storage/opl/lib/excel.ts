import type { OplMapping, UploadLine } from './opl'

/**
 * Lectura de Excel (.xlsx) en el navegador para Auditoría OPL. Usa
 * `read-excel-file` (solo lectura, sin dependencias pesadas) cargado bajo
 * demanda para no engordar el resto de la app.
 */

export type Cell = string | number | boolean | Date | null | undefined
export interface WorkbookSheet {
  name: string
  rows: Cell[][]
}

export async function readWorkbook(file: File): Promise<WorkbookSheet[]> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('El archivo debe ser Excel .xlsx.')
  const { default: readXlsxFile } = await import('read-excel-file/universal')
  try {
    const sheets = await readXlsxFile(file)
    return sheets.map((s) => ({ name: s.sheet, rows: (s.data ?? []) as Cell[][] }))
  } catch (e) {
    throw new Error(`No se pudo leer el Excel: ${e instanceof Error ? e.message : String(e)}`)
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Texto de una celda (fechas como dd/mm/aaaa, números sin notación científica). */
export function cellText(c: Cell): string {
  if (c === null || c === undefined) return ''
  if (c instanceof Date) return `${pad(c.getUTCDate())}/${pad(c.getUTCMonth() + 1)}/${c.getUTCFullYear()}`
  if (typeof c === 'number') return Number.isInteger(c) ? String(c) : String(Math.round(c * 1e6) / 1e6)
  return String(c).trim()
}

const norm = (s: string) => s.trim().toUpperCase()

/** Primera fila (de las 20 primeras) con al menos 3 títulos de texto: se asume como fila de títulos. */
export function detectHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const texts = (rows[i] ?? []).filter((c) => typeof c === 'string' && c.trim()).length
    if (texts >= 3) return i + 1
  }
  return 1
}

/** Títulos de una fila (1 = primera). Vacíos → "Columna N"; repetidos → "TÍTULO (2)". */
export function headersAt(rows: Cell[][], headerRow: number): string[] {
  const row = rows[headerRow - 1] ?? []
  const seen = new Map<string, number>()
  return row.map((c, i) => {
    let h = cellText(c) || `Columna ${i + 1}`
    const n = (seen.get(norm(h)) ?? 0) + 1
    seen.set(norm(h), n)
    if (n > 1) h = `${h} (${n})`
    return h
  })
}

/** Cuántas filas con datos hay debajo de los títulos (para mostrar en el modelo). */
export function dataRowCount(rows: Cell[][], headerRow: number): number {
  return rows.slice(headerRow).filter((r) => r?.some((c) => cellText(c) !== '')).length
}

function requiredColumns(m: OplMapping): string[] {
  return [m.key, m.sku, m.description, m.qty, ...(m.location ? [m.location] : [])]
}

/** Busca la fila de títulos que contiene todas las columnas del mapeo (primeras 30 filas). */
export function findHeaderRowForMapping(rows: Cell[][], m: OplMapping, preferred: number): number | null {
  const need = requiredColumns(m).map(norm)
  const fits = (i: number) => {
    const hs = new Set(headersAt(rows, i).map(norm))
    return need.every((h) => hs.has(h))
  }
  if (preferred >= 1 && fits(preferred)) return preferred
  for (let i = 1; i <= Math.min(rows.length, 30); i++) if (fits(i)) return i
  return null
}

/** Elige la hoja del archivo: la del modelo si existe; si no, la primera que tenga los títulos. */
export function pickSheet(sheets: WorkbookSheet[], m: OplMapping, sheetName: string | null, headerRow: number) {
  const ordered = [
    ...sheets.filter((s) => sheetName && s.name.trim().toUpperCase() === sheetName.trim().toUpperCase()),
    ...sheets.filter((s) => !sheetName || s.name.trim().toUpperCase() !== sheetName.trim().toUpperCase()),
  ]
  for (const s of ordered) {
    const hr = findHeaderRowForMapping(s.rows, m, headerRow)
    if (hr) return { sheet: s, headerRow: hr }
  }
  return null
}

export interface BuildResult {
  lines: UploadLine[]
  skipped: number
  problems: string[]
  duplicates: string[]
  skuCount: number
  totalQty: number
}

/** Convierte las filas del Excel en líneas de auditoría según el mapeo del OPL. */
export function buildLines(rows: Cell[][], headerRow: number, m: OplMapping): BuildResult {
  const headers = headersAt(rows, headerRow).map(norm)
  const col = (h: string) => headers.indexOf(norm(h))
  const ki = col(m.key)
  const si = col(m.sku)
  const di = col(m.description)
  const qi = col(m.qty)
  const li = m.location ? col(m.location) : -1
  const extras = m.extras.map((h) => ({ h, i: col(h) })).filter((e) => e.i >= 0)

  const lines: UploadLine[] = []
  const problems: string[] = []
  const seen = new Map<string, number>()
  const duplicates: string[] = []
  let skipped = 0

  rows.slice(headerRow).forEach((r, idx) => {
    const excelRow = headerRow + idx + 1
    const key = cellText(r?.[ki])
    const sku = cellText(r?.[si])
    if (!key && !sku) {
      skipped++
      return
    }
    if (!key) return void problems.push(`Fila ${excelRow}: sin ${m.key_label}.`)
    if (!sku) return void problems.push(`Fila ${excelRow}: sin SKU (${m.key_label} ${key}).`)
    const rawQty = r?.[qi]
    const q = typeof rawQty === 'number' ? rawQty : Number(cellText(rawQty).replace(/,/g, ''))
    if (!Number.isFinite(q) || q < 0) return void problems.push(`Fila ${excelRow}: cantidad inválida (${cellText(rawQty) || 'vacía'}).`)
    const nk = norm(key)
    if (seen.has(nk)) duplicates.push(`${key} (filas ${seen.get(nk)} y ${excelRow})`)
    else seen.set(nk, excelRow)
    lines.push({
      n: excelRow,
      k: key,
      s: sku,
      d: cellText(r?.[di]),
      l: li >= 0 ? cellText(r?.[li]) : '',
      q,
      x: Object.fromEntries(extras.map((e) => [e.h, cellText(r?.[e.i])])),
    })
  })

  return {
    lines,
    skipped,
    problems,
    duplicates,
    skuCount: new Set(lines.map((l) => l.s)).size,
    totalQty: lines.reduce((a, l) => a + l.q, 0),
  }
}
