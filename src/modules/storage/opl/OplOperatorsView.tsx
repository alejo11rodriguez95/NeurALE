import { useEffect, useMemo, useState } from 'react'

import { GhostButton, PrimaryButton, SectionTitle, fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/storage/isq/ui'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

import { buildLines, cellText, dataRowCount, detectHeaderRow, headersAt, readWorkbook, type WorkbookSheet } from './lib/excel'
import { deleteOperator, fetchOperators, fmtNum, saveOperator, type OplMapping, type OplOperator } from './lib/opl'
import { Badge, EmptyState, ErrorState } from './ui'

const storage = MODULES.find((m) => m.id === 'storage')!
const ring = ringStyle(storage.color)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Adivina la columna por nombre (para precargar el mapeo con el Excel modelo). */
function guess(headers: string[], ...names: string[]): string {
  const up = headers.map((h) => h.toUpperCase())
  for (const n of names) {
    const i = up.findIndex((h) => h === n)
    if (i >= 0) return headers[i]
  }
  for (const n of names) {
    const i = up.findIndex((h) => h.includes(n))
    if (i >= 0) return headers[i]
  }
  return ''
}

interface Draft {
  id: string | null
  name: string
  active: boolean
  sheet_name: string | null
  header_row: number
  headers: string[]
  mapping: OplMapping
  sample_file_name: string | null
}

const EMPTY_MAPPING: OplMapping = { key: '', key_label: '', sku: '', description: '', qty: '', location: null, extras: [] }

/**
 * Auditoría OPL → "Asignación de OPL": alta del operador logístico y
 * parametrización con un Excel modelo. Solo jefe de Storage, gerencia, admin.
 */
export function OplOperatorsView() {
  const [items, setItems] = useState<OplOperator[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  const load = () => fetchOperators(true).then(setItems).catch((e) => setError(errMsg(e)))
  useEffect(() => {
    load()
  }, [])

  if (draft) {
    return (
      <OperatorForm
        draft={draft}
        onCancel={() => setDraft(null)}
        onSaved={() => {
          setDraft(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Asignación de OPL"
        subtitle="Agrega cada operador logístico y enséñale a NeurALE cómo viene su Excel. Cada OPL aparece como su propia opción “Auditoría {OPL}”."
        right={
          <PrimaryButton
            color={storage.color}
            onClick={() =>
              setDraft({ id: null, name: '', active: true, sheet_name: null, header_row: 1, headers: [], mapping: EMPTY_MAPPING, sample_file_name: null })
            }
          >
            + Agregar OPL
          </PrimaryButton>
        }
      />
      {error ? <ErrorState>{error}</ErrorState> : null}
      {items === null ? (
        <EmptyState>Cargando…</EmptyState>
      ) : items.length === 0 ? (
        <EmptyState>Todavía no hay operadores logísticos. Agrega el primero (ej. TLA) y sube su Excel modelo.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((o) => (
            <GlassCard key={o.id} className="p-5" style={{ borderColor: withAlpha(storage.color, o.active ? 0.25 : 0.08) }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-display text-lg font-semibold ${o.active ? 'text-white' : 'text-white/40 line-through'}`}>{o.name}</span>
                {!o.active ? <Badge color="#94a3b8">Inactivo</Badge> : null}
              </div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-white/40">Llave de conteo</dt>
                <dd className="text-white/80">
                  {o.mapping.key_label} <span className="text-white/40">(columna {o.mapping.key})</span>
                </dd>
                <dt className="text-white/40">SKU · Descripción · Cantidad</dt>
                <dd className="text-white/80">
                  {o.mapping.sku} · {o.mapping.description} · {o.mapping.qty}
                </dd>
                <dt className="text-white/40">Ubicación</dt>
                <dd className="text-white/80">{o.mapping.location ?? '—'}</dd>
                <dt className="text-white/40">Se muestran al contar</dt>
                <dd className="text-white/80">{o.mapping.extras.join(', ') || '—'}</dd>
                <dt className="text-white/40">Hoja · fila de títulos</dt>
                <dd className="text-white/80">
                  {o.sheet_name ?? 'primera'} · {o.header_row}
                </dd>
                <dt className="text-white/40">Excel modelo</dt>
                <dd className="truncate text-white/80">{o.sample_file_name ?? '—'}</dd>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <GhostButton
                  onClick={() =>
                    setDraft({
                      id: o.id,
                      name: o.name,
                      active: o.active,
                      sheet_name: o.sheet_name,
                      header_row: o.header_row,
                      headers: o.headers,
                      mapping: o.mapping,
                      sample_file_name: o.sample_file_name,
                    })
                  }
                >
                  Editar
                </GhostButton>
                <GhostButton
                  onClick={() =>
                    saveOperator({ ...o, active: !o.active })
                      .then(load)
                      .catch((e) => setError(errMsg(e)))
                  }
                >
                  {o.active ? 'Desactivar' : 'Activar'}
                </GhostButton>
                <GhostButton
                  className="hover:!text-rose-400"
                  onClick={() =>
                    window.confirm(`¿Eliminar el OPL "${o.name}"? Solo se puede si no tiene auditorías.`) &&
                    deleteOperator(o.id)
                      .then(load)
                      .catch((e) => setError(errMsg(e)))
                  }
                >
                  Eliminar
                </GhostButton>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  )
}

function OperatorForm({ draft: initial, onCancel, onSaved }: { draft: Draft; onCancel: () => void; onSaved: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const [sheets, setSheets] = useState<WorkbookSheet[] | null>(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sheet = sheets?.find((s) => s.name === d.sheet_name) ?? null
  const headers = sheet ? headersAt(sheet.rows, d.header_row) : d.headers
  const m = d.mapping
  const setM = (patch: Partial<OplMapping>) => setD((p) => ({ ...p, mapping: { ...p.mapping, ...patch } }))

  function applySheet(s: WorkbookSheet, headerRow?: number) {
    const hr = headerRow ?? detectHeaderRow(s.rows)
    const hs = headersAt(s.rows, hr)
    setD((p) => {
      const keep = (h: string | null) => (h && hs.includes(h) ? h : '')
      const key = keep(p.mapping.key) || guess(hs, 'LPN', 'LICENSE', 'PALLET', 'ID')
      return {
        ...p,
        sheet_name: s.name,
        header_row: hr,
        headers: hs,
        mapping: {
          key,
          key_label: p.mapping.key_label || key,
          sku: keep(p.mapping.sku) || guess(hs, 'SKU', 'CODIGO', 'ITEM', 'ARTICULO'),
          description: keep(p.mapping.description) || guess(hs, 'DESCR', 'DESCRIPCION', 'DESCRIPTION'),
          qty: keep(p.mapping.qty) || guess(hs, 'CANT', 'CANTIDAD', 'QTY'),
          location: keep(p.mapping.location) || guess(hs, 'UBICACION', 'LOCATION', 'LOC') || null,
          extras: p.mapping.extras.filter((x) => hs.includes(x)),
        },
      }
    })
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    setError(null)
    setReading(true)
    try {
      const wb = await readWorkbook(f)
      if (!wb.length) throw new Error('El archivo no tiene hojas.')
      setSheets(wb)
      // Hoja con más filas de datos (ej. "BDD" frente a un "RESUMEN").
      const best = [...wb].sort((a, b) => dataRowCount(b.rows, detectHeaderRow(b.rows)) - dataRowCount(a.rows, detectHeaderRow(a.rows)))[0]
      setD((p) => ({ ...p, sample_file_name: f.name }))
      applySheet(best)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setReading(false)
    }
  }

  const preview = useMemo(() => {
    if (!sheet || !m.key || !m.sku || !m.description || !m.qty) return null
    return buildLines(sheet.rows, d.header_row, m)
  }, [sheet, d.header_row, m])

  async function save() {
    setError(null)
    if (!d.name.trim()) return setError('Ponle nombre al OPL.')
    if (!m.key || !m.sku || !m.description || !m.qty) return setError('Elige la llave de conteo, SKU, Descripción y Cantidad.')
    if (!d.headers.length) return setError('Sube el Excel modelo para leer sus títulos.')
    const keys = [m.key, m.sku, m.description, m.qty]
    if (new Set(keys).size !== keys.length) return setError('La llave, SKU, Descripción y Cantidad deben ser columnas distintas.')
    setSaving(true)
    try {
      await saveOperator({ ...d, name: d.name.trim(), mapping: { ...m, key_label: m.key_label.trim() || m.key } })
      onSaved()
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  const colSelect = (value: string | null, onChange: (v: string) => void, optional = false) => (
    <select className={fieldControlClass} style={ring} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={!headers.length}>
      <option value="" className="bg-neurale-deep">
        {optional ? 'No usar' : headers.length ? 'Elige la columna…' : 'Sube el Excel modelo'}
      </option>
      {headers.map((h) => (
        <option key={h} value={h} className="bg-neurale-deep">
          {h}
        </option>
      ))}
    </select>
  )

  return (
    <div className="space-y-5">
      <SectionTitle title={d.id ? `Editar OPL · ${initial.name}` : 'Nuevo OPL'} subtitle="Sube un Excel de ejemplo del operador: NeurALE lee sus títulos y tú eliges con cuáles se hace la auditoría." />

      <GlassCard className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={fieldLabelClass}>Nombre del OPL *</span>
            <input className={fieldControlClass} style={ring} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ej. TLA" />
            <span className="mt-1 block text-[11px] text-white/35">La opción se llamará “Auditoría {d.name.trim() || '…'}”.</span>
          </label>
          <label>
            <span className={fieldLabelClass}>Excel modelo (.xlsx) {d.id ? '' : '*'}</span>
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className={`${fieldControlClass} file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white/80`}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <span className="mt-1 block text-[11px] text-white/35">
              {reading ? 'Leyendo…' : d.sample_file_name ? `Modelo: ${d.sample_file_name}` : 'Ej. el inventario por ubicación del operador.'}
            </span>
          </label>
        </div>

        {sheets ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={fieldLabelClass}>Hoja con el detalle</span>
              <select
                className={fieldControlClass}
                style={ring}
                value={d.sheet_name ?? ''}
                onChange={(e) => {
                  const s = sheets.find((x) => x.name === e.target.value)
                  if (s) applySheet(s)
                }}
              >
                {sheets.map((s) => (
                  <option key={s.name} value={s.name} className="bg-neurale-deep">
                    {s.name} · {fmtNum(dataRowCount(s.rows, detectHeaderRow(s.rows)))} filas
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={fieldLabelClass}>Fila de títulos</span>
              <input
                type="number"
                min={1}
                className={fieldControlClass}
                style={ring}
                value={d.header_row}
                onChange={(e) => sheet && applySheet(sheet, Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
          </div>
        ) : d.id ? (
          <p className="text-xs text-white/45">
            Títulos guardados del modelo: {d.headers.join(' · ')}. Sube otra vez el Excel si cambió el formato.
          </p>
        ) : null}

        {headers.length ? (
          <div className="flex flex-wrap gap-1.5">
            {headers.map((h) => (
              <span key={h} className="rounded-md border border-neurale-border bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/65">
                {h}
              </span>
            ))}
          </div>
        ) : null}
      </GlassCard>

      {headers.length ? (
        <GlassCard className="space-y-4 p-5">
          <h3 className="font-display text-base font-semibold text-white">¿En base a qué se audita?</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className={fieldLabelClass}>Llave de conteo * (se escanea y se cuenta una vez)</span>
              {colSelect(m.key, (v) => setM({ key: v, key_label: !m.key_label || m.key_label === m.key ? v : m.key_label }))}
            </label>
            <label>
              <span className={fieldLabelClass}>Nombre de la llave en pantalla</span>
              <input className={fieldControlClass} style={ring} value={m.key_label} onChange={(e) => setM({ key_label: e.target.value })} placeholder="Ej. LPN" />
            </label>
            <label>
              <span className={fieldLabelClass}>SKU *</span>
              {colSelect(m.sku, (v) => setM({ sku: v }))}
            </label>
            <label>
              <span className={fieldLabelClass}>Descripción *</span>
              {colSelect(m.description, (v) => setM({ description: v }))}
            </label>
            <label>
              <span className={fieldLabelClass}>Cantidad *</span>
              {colSelect(m.qty, (v) => setM({ qty: v }))}
            </label>
            <label>
              <span className={fieldLabelClass}>Ubicación</span>
              {colSelect(m.location, (v) => setM({ location: v || null }), true)}
            </label>
          </div>
          <div>
            <span className={fieldLabelClass}>Otras columnas que se muestran al contar (opcional)</span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {headers
                .filter((h) => ![m.key, m.sku, m.description, m.qty, m.location].includes(h))
                .map((h) => {
                  const on = m.extras.includes(h)
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setM({ extras: on ? m.extras.filter((x) => x !== h) : [...m.extras, h] })}
                      className="rounded-full border px-3 py-1 text-xs transition-colors"
                      style={
                        on
                          ? { background: withAlpha(storage.color, 0.18), borderColor: storage.color, color: storage.color }
                          : { borderColor: 'var(--color-neurale-border)', color: 'rgba(255,255,255,0.55)' }
                      }
                    >
                      {on ? '✓ ' : ''}
                      {h}
                    </button>
                  )
                })}
            </div>
          </div>

          {preview ? (
            <div className="rounded-xl border border-neurale-border bg-white/[0.03] p-4 text-sm">
              <p className="text-white/80">
                Con este modelo: <b className="text-white">{fmtNum(preview.lines.length)}</b> {m.key_label || m.key} ·{' '}
                <b className="text-white">{fmtNum(preview.skuCount)}</b> SKU · <b className="text-white">{fmtNum(preview.totalQty)}</b> unidades
              </p>
              {preview.duplicates.length ? (
                <p className="mt-2 text-rose-300">
                  ⚠ “{m.key}” se repite ({preview.duplicates.length}): {preview.duplicates.slice(0, 3).join('; ')}
                  {preview.duplicates.length > 3 ? '…' : ''}. La llave debe ser única por fila — elige otra columna.
                </p>
              ) : (
                <p className="mt-1 text-xs" style={{ color: storage.color }}>
                  ✓ Cada {m.key_label || m.key} aparece una sola vez.
                </p>
              )}
              {preview.problems.length ? (
                <p className="mt-1 text-xs text-amber-300">
                  {preview.problems.length} fila(s) con problemas: {preview.problems.slice(0, 2).join(' ')}
                </p>
              ) : null}
              {preview.lines[0] ? (
                <p className="mt-2 text-xs text-white/45">
                  Ejemplo: {m.key_label || m.key} {preview.lines[0].k} · {preview.lines[0].l || 'sin ubicación'} · SKU {preview.lines[0].s} ·{' '}
                  {preview.lines[0].d}
                  {Object.entries(preview.lines[0].x).map(([k, v]) => ` · ${k}: ${cellText(v) || '—'}`)}
                </p>
              ) : null}
            </div>
          ) : null}
        </GlassCard>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton color={storage.color} disabled={saving || reading} onClick={save}>
          {saving ? 'Guardando…' : 'Guardar OPL'}
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancelar</GhostButton>
      </div>
    </div>
  )
}
