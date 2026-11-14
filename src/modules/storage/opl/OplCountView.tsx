import { useEffect, useMemo, useRef, useState } from 'react'

import { GhostButton, PrimaryButton, SectionTitle, fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/storage/isq/ui'
import { GlassCard } from '@/shared/components/GlassCard'
import { MODULES, withAlpha } from '@/shared/modules'

import { BarcodeScanner } from './BarcodeScanner'
import { buildLines, pickSheet, readWorkbook, type BuildResult } from './lib/excel'
import {
  closeAudit,
  countKey,
  createAudit,
  deleteAudit,
  fetchAudit,
  fetchAudits,
  fetchMyCounts,
  fetchSkuSummary,
  fmtNum,
  lookupKey,
  registerExtra,
  reopenAudit,
  undoCount,
  type LookupResult,
  type OplAudit,
  type OplOperator,
} from './lib/opl'
import { AuditCard, AuditStatusBadge, EmptyState, ErrorState, ProgressBar, useOplLive } from './ui'

const storage = MODULES.find((m) => m.id === 'storage')!
const C = storage.color
const ring = ringStyle(C)
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const timeOf = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-SV', { timeZone: 'America/El_Salvador', hour: '2-digit', minute: '2-digit' }) : ''

/**
 * Auditoría OPL → "Auditoría {OPL}": lista de auditorías del OPL, carga del
 * Excel de una auditoría nueva (configuradores) y pantalla de conteo para el
 * celular (todos los usuarios de Storage).
 */
export function OplCountView({
  operator,
  auditId,
  canManage,
  onOpenAudit,
}: {
  operator: OplOperator
  auditId: string | null
  canManage: boolean
  onOpenAudit: (id: string | null) => void
}) {
  if (auditId) return <CountScreen auditId={auditId} canManage={canManage} onBack={() => onOpenAudit(null)} />
  return <AuditList operator={operator} canManage={canManage} onOpenAudit={onOpenAudit} />
}

/* ---------- Lista + nueva auditoría ---------- */

function AuditList({ operator, canManage, onOpenAudit }: { operator: OplOperator; canManage: boolean; onOpenAudit: (id: string) => void }) {
  const [creating, setCreating] = useState(false)
  const { data, error, reload } = useOplLive(() => fetchAudits(operator.id), [operator.id])
  const open = data?.filter((a) => a.status === 'en_curso') ?? []
  const closed = data?.filter((a) => a.status === 'cerrada') ?? []

  return (
    <div className="space-y-5">
      <SectionTitle
        title={`Auditoría ${operator.name}`}
        subtitle={`Conteo por ${operator.mapping.key_label}. Elige la auditoría en curso para contar; varias personas pueden contar al mismo tiempo.`}
        right={
          canManage && !creating ? (
            <PrimaryButton color={C} onClick={() => setCreating(true)}>
              + Nueva auditoría
            </PrimaryButton>
          ) : null
        }
      />
      {creating ? (
        <NewAuditForm
          operator={operator}
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false)
            reload()
            onOpenAudit(id)
          }}
        />
      ) : null}
      {error ? <ErrorState>{error}</ErrorState> : null}
      {data === null ? (
        <EmptyState>Cargando…</EmptyState>
      ) : data.length === 0 ? (
        <EmptyState>
          No hay auditorías de {operator.name}. {canManage ? 'Carga el Excel del operador con “+ Nueva auditoría”.' : 'El jefe de Storage debe cargar el Excel.'}
        </EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            {open.map((a) => (
              <AuditCard
                key={a.id}
                audit={a}
                color={C}
                onOpen={() => onOpenAudit(a.id)}
                actions={
                  <PrimaryButton color={C} onClick={() => onOpenAudit(a.id)}>
                    Contar
                  </PrimaryButton>
                }
              />
            ))}
          </div>
          {closed.length ? (
            <details className="group">
              <summary className="cursor-pointer text-sm text-white/55">Auditorías cerradas ({closed.length})</summary>
              <div className="mt-3 space-y-3">
                {closed.map((a) => (
                  <AuditCard key={a.id} audit={a} color={C} onOpen={() => onOpenAudit(a.id)} />
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  )
}

function NewAuditForm({ operator, onCancel, onCreated }: { operator: OplOperator; onCancel: () => void; onCreated: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [result, setResult] = useState<BuildResult | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const m = operator.mapping

  async function onFile(f: File | undefined) {
    setError(null)
    setResult(null)
    setFile(f ?? null)
    if (!f) return
    setBusy(true)
    try {
      const wb = await readWorkbook(f)
      const picked = pickSheet(wb, m, operator.sheet_name, operator.header_row)
      if (!picked) {
        const need = [m.key, m.sku, m.description, m.qty, m.location].filter(Boolean).join(', ')
        throw new Error(`El archivo no tiene el formato de ${operator.name}: no se encontraron los títulos ${need}.`)
      }
      setSheetName(picked.sheet.name)
      setResult(buildLines(picked.sheet.rows, picked.headerRow, m))
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function upload() {
    if (!file || !result) return
    setBusy(true)
    setError(null)
    try {
      const id = await createAudit(operator.id, file.name, sheetName, note, result.lines, (d, t) => setProgress([d, t]))
      onCreated(id)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const blocked = !result || result.lines.length === 0 || result.duplicates.length > 0

  return (
    <GlassCard className="space-y-4 p-5" style={{ borderColor: withAlpha(C, 0.35) }}>
      <h3 className="font-display text-base font-semibold text-white">Nueva auditoría · {operator.name}</h3>
      <label className="block">
        <span className={fieldLabelClass}>Excel del operador (.xlsx)</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className={`${fieldControlClass} file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1 file:text-white/80`}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </label>
      {busy && !progress ? <p className="text-sm text-white/55">Leyendo…</p> : null}
      {result ? (
        <div className="rounded-xl border border-neurale-border bg-white/[0.03] p-4 text-sm">
          <p className="text-white/80">
            Hoja <b className="text-white">{sheetName}</b>: <b className="text-white">{fmtNum(result.lines.length)}</b> {m.key_label} ·{' '}
            <b className="text-white">{fmtNum(result.skuCount)}</b> SKU · <b className="text-white">{fmtNum(result.totalQty)}</b> unidades
          </p>
          {result.duplicates.length ? (
            <p className="mt-2 text-rose-300">
              ⚠ {result.duplicates.length} {m.key_label} repetido(s): {result.duplicates.slice(0, 4).join('; ')}
              {result.duplicates.length > 4 ? '…' : ''}. Corrige el archivo antes de cargarlo.
            </p>
          ) : null}
          {result.problems.length ? (
            <details className="mt-2 text-amber-300">
              <summary className="cursor-pointer">{result.problems.length} fila(s) no se van a cargar</summary>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {result.problems.slice(0, 30).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      <label className="block">
        <span className={fieldLabelClass}>Nota (opcional)</span>
        <input className={fieldControlClass} style={ring} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Inventario general noviembre" />
      </label>
      {progress ? (
        <div className="space-y-1">
          <ProgressBar value={progress[0]} total={progress[1]} color={C} />
          <p className="text-xs text-white/50">
            Cargando {fmtNum(progress[0])} de {fmtNum(progress[1])}…
          </p>
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <PrimaryButton color={C} disabled={busy || blocked} onClick={upload}>
          {busy && progress ? 'Cargando…' : 'Crear auditoría'}
        </PrimaryButton>
        <GhostButton onClick={onCancel} disabled={busy}>
          Cancelar
        </GhostButton>
      </div>
    </GlassCard>
  )
}

/* ---------- Conteo (celular) ---------- */

const CONTINUOUS_KEY = 'neurale:opl-continuous'

function CountScreen({ auditId, canManage, onBack }: { auditId: string; canManage: boolean; onBack: () => void }) {
  const { data: audit, error } = useOplLive(() => fetchAudit(auditId), [auditId])
  const mine = useOplLive(() => fetchMyCounts(auditId, 10), [auditId])
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [hit, setHit] = useState<LookupResult | null>(null)
  const [looking, setLooking] = useState(false)
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null)
  const [continuous, setContinuous] = useState(() => {
    try {
      return localStorage.getItem(CONTINUOUS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [actionError, setActionError] = useState<string | null>(null)

  const label = audit?.mapping.key_label ?? 'código'
  const running = audit?.status === 'en_curso'

  async function lookup(code: string) {
    const k = code.trim()
    if (!k) return
    setLooking(true)
    setActionError(null)
    setFlash(null)
    try {
      setHit(await lookupKey(auditId, k))
      setManual('')
    } catch (e) {
      setActionError(errMsg(e))
    } finally {
      setLooking(false)
    }
  }

  function afterAction(text: string) {
    setFlash({ ok: true, text })
    setHit(null)
    mine.reload()
    if (continuous) setTimeout(() => setScanning(true), 600)
  }

  if (error) return <ErrorState>{error}</ErrorState>
  if (!audit) return <EmptyState>Cargando…</EmptyState>

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-white/50 hover:text-white/80">
        ← Auditorías
      </button>
      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-semibold text-white">{audit.folio}</span>
            <AuditStatusBadge status={audit.status} />
          </div>
          <span className="text-sm text-white/60 tabular-nums">
            {fmtNum(audit.counted_lines)} / {fmtNum(audit.line_count)} {label}
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar value={audit.counted_lines} total={audit.line_count} color={C} />
        </div>
        <p className="mt-1.5 text-xs text-white/45 tabular-nums">
          {fmtNum(audit.counted_units)} unidades contadas entre todos{audit.extra_count ? ` · ${audit.extra_count} sobrante(s)` : ''}
        </p>
        {canManage ? <ManageAuditBar audit={audit} onDeleted={onBack} /> : null}
      </GlassCard>

      {!running ? (
        <EmptyState>
          {audit.status === 'cerrada'
            ? `Auditoría cerrada${audit.closed_by_name ? ` por ${audit.closed_by_name}` : ''}. Ya no se puede contar; revisa Resultados.`
            : 'La auditoría todavía se está cargando.'}
        </EmptyState>
      ) : (
        <>
          <GlassCard className="space-y-3 p-4">
            <button
              type="button"
              onClick={() => setScanning(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display text-lg font-semibold text-neurale-bg"
              style={{ background: C }}
            >
              📷 Escanear {label}
            </button>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                lookup(manual)
              }}
            >
              <input
                className={`${fieldControlClass} mt-0 flex-1 uppercase`}
                style={ring}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder={`O escribe el ${label}`}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
              <GhostButton type="submit" disabled={looking || !manual.trim()} className="!px-4 !py-2 !text-sm">
                Buscar
              </GhostButton>
            </form>
            <label className="flex items-center gap-2 text-xs text-white/55">
              <input
                type="checkbox"
                checked={continuous}
                style={{ accentColor: C }}
                onChange={(e) => {
                  setContinuous(e.target.checked)
                  try {
                    localStorage.setItem(CONTINUOUS_KEY, e.target.checked ? '1' : '0')
                  } catch {
                    /* sin almacenamiento */
                  }
                }}
              />
              Escaneo continuo (abre la cámara otra vez al confirmar)
            </label>
          </GlassCard>

          {flash ? (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: withAlpha(flash.ok ? '#4ade80' : '#f87171', 0.12), color: flash.ok ? '#4ade80' : '#f87171' }}>
              {flash.ok ? '✓ ' : ''}
              {flash.text}
            </div>
          ) : null}
          {actionError ? <p className="text-sm text-rose-400">{actionError}</p> : null}
          {looking ? <p className="text-sm text-white/50">Buscando…</p> : null}

          {hit ? (
            <HitPanel
              key={hit.key}
              auditId={auditId}
              hit={hit}
              label={label}
              canManage={canManage}
              onDone={afterAction}
              onCancel={() => setHit(null)}
              onError={setActionError}
            />
          ) : null}
        </>
      )}

      <GlassCard className="p-4">
        <h3 className="font-display text-sm font-semibold text-white">Mis últimos conteos</h3>
        {mine.data === null ? (
          <p className="mt-2 text-sm text-white/45">Cargando…</p>
        ) : mine.data.length === 0 ? (
          <p className="mt-2 text-sm text-white/45">Todavía no has contado en esta auditoría.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neurale-border">
            {mine.data.map((c) => (
              <li key={c.key_value} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-white">
                    {c.key_value} · <b className="tabular-nums">{fmtNum(c.qty)}</b>
                  </p>
                  <p className="truncate text-xs text-white/45">
                    {c.location ?? '—'} · {c.sku} · {c.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-white/35 tabular-nums">{timeOf(c.counted_at)}</span>
                  {running ? (
                    <button
                      type="button"
                      className="text-xs text-white/40 hover:text-rose-300"
                      onClick={() =>
                        window.confirm(`¿Deshacer el conteo de ${c.key_value}? Quedará pendiente para contarlo de nuevo.`) &&
                        undoCount(auditId, c.key_value)
                          .then(() => {
                            mine.reload()
                            setFlash({ ok: true, text: `Conteo de ${c.key_value} deshecho.` })
                          })
                          .catch((e) => setActionError(errMsg(e)))
                      }
                    >
                      Deshacer
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {scanning ? (
        <BarcodeScanner
          color={C}
          title={`Escanear ${label}`}
          onClose={() => setScanning(false)}
          onDetected={(code) => {
            setScanning(false)
            lookup(code)
          }}
        />
      ) : null}
    </div>
  )
}

function HitPanel({
  auditId,
  hit,
  label,
  canManage,
  onDone,
  onCancel,
  onError,
}: {
  auditId: string
  hit: LookupResult
  label: string
  canManage: boolean
  onDone: (text: string) => void
  onCancel: () => void
  onError: (e: string | null) => void
}) {
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)
  const qtyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    qtyRef.current?.focus()
  }, [])

  const closedReview = hit.review === 'cuadrado' || hit.review === 'diferencia_confirmada'

  async function confirm() {
    const q = Number(qty.replace(',', '.'))
    if (qty.trim() === '' || !Number.isFinite(q) || q < 0) return onError('Escribe la cantidad contada.')
    setBusy(true)
    onError(null)
    try {
      const r = await countKey(auditId, hit.key, q)
      if (!r.ok) onError(`Ese ${label} ya lo contó ${r.counted_by ?? 'otra persona'} a las ${timeOf(r.counted_at)}.`)
      else onDone(`${hit.key} contado: ${fmtNum(q)} (SKU ${hit.sku})`)
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  if (!hit.found) {
    if (hit.extra_registered) {
      return (
        <GlassCard className="p-4 text-sm">
          <p className="text-white">
            {hit.key} ya está registrado como <b>sobrante</b> (SKU {hit.sku}, {fmtNum(hit.qty)} unidades){hit.by ? ` por ${hit.by}` : ''}.
          </p>
          <GhostButton className="mt-3" onClick={onCancel}>
            Listo
          </GhostButton>
        </GlassCard>
      )
    }
    return <ExtraForm auditId={auditId} keyValue={hit.key} label={label} onDone={onDone} onCancel={onCancel} onError={onError} />
  }

  return (
    <GlassCard className="space-y-4 p-4" style={{ borderColor: withAlpha(C, 0.45) }}>
      <div>
        <p className="text-[11px] tracking-wide text-white/45 uppercase">{label}</p>
        <p className="font-display text-xl font-semibold text-white">{hit.key}</p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div className="rounded-xl bg-white/[0.05] p-3">
          <p className="text-[11px] tracking-wide text-white/45 uppercase">Ubicación</p>
          <p className="font-display text-2xl font-semibold" style={{ color: C }}>
            {hit.location ?? '—'}
          </p>
        </div>
        <div className="rounded-xl bg-white/[0.05] p-3">
          <p className="text-[11px] tracking-wide text-white/45 uppercase">SKU</p>
          <p className="font-display text-xl font-semibold text-white">{hit.sku}</p>
          <p className="mt-1 text-sm text-white/75">{hit.description}</p>
        </div>
        {hit.extra && Object.keys(hit.extra).length ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
            {Object.entries(hit.extra).map(([k, v]) => (
              <span key={k}>
                <span className="text-white/40">{k}:</span> {v || '—'}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {hit.counted ? (
        <div className="space-y-3 text-sm">
          <p className="text-amber-300">
            Ya contado por {hit.counted_by ?? 'otra persona'} a las {timeOf(hit.counted_at)}
            {hit.my_qty !== null && hit.my_qty !== undefined ? ` · ${fmtNum(hit.my_qty)} unidades` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            {(hit.mine || canManage) && !closedReview ? (
              <GhostButton
                onClick={() =>
                  undoCount(auditId, hit.key)
                    .then(() => onDone(`Conteo de ${hit.key} deshecho: escanéalo de nuevo para contarlo.`))
                    .catch((e) => onError(errMsg(e)))
                }
              >
                Deshacer y volver a contar
              </GhostButton>
            ) : null}
            <GhostButton onClick={onCancel}>Listo</GhostButton>
          </div>
        </div>
      ) : closedReview ? (
        <p className="text-sm text-white/60">Este SKU ya se cerró en Revisión de Discrepancias.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            confirm()
          }}
        >
          <label className="block">
            <span className={fieldLabelClass}>Cantidad contada</span>
            <input
              ref={qtyRef}
              type="text"
              inputMode="decimal"
              className={`${fieldControlClass} text-center font-display text-3xl font-semibold tabular-nums`}
              style={ring}
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="0"
            />
          </label>
          <div className="flex gap-2">
            <PrimaryButton type="submit" color={C} disabled={busy || qty.trim() === ''} className="flex-1 !py-3 !text-base">
              {busy ? 'Guardando…' : 'Confirmar conteo'}
            </PrimaryButton>
            <GhostButton onClick={onCancel}>Cancelar</GhostButton>
          </div>
        </form>
      )}
    </GlassCard>
  )
}

function ExtraForm({
  auditId,
  keyValue,
  label,
  onDone,
  onCancel,
  onError,
}: {
  auditId: string
  keyValue: string
  label: string
  onDone: (t: string) => void
  onCancel: () => void
  onError: (e: string | null) => void
}) {
  const skus = useOplLive(() => fetchSkuSummary(auditId), [auditId])
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const known = useMemo(() => skus.data?.find((s) => s.sku.toUpperCase() === sku.trim().toUpperCase()), [skus.data, sku])

  async function save() {
    const q = Number(qty.replace(',', '.'))
    if (!sku.trim()) return onError('Escribe el SKU del sobrante.')
    if (qty.trim() === '' || !Number.isFinite(q) || q < 0) return onError('Escribe la cantidad contada.')
    setBusy(true)
    onError(null)
    try {
      await registerExtra(auditId, { key: keyValue, sku: sku.trim(), description: known ? '' : description, location, qty: q, note })
      onDone(`Sobrante registrado: ${keyValue} · SKU ${sku.trim()} · ${fmtNum(q)}`)
    } catch (e) {
      onError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard className="space-y-3 p-4" style={{ borderColor: 'rgba(251,146,60,0.5)' }}>
      <p className="text-sm text-orange-300">
        ⚠ <b>{keyValue}</b> no está en el formato del operador. Si está físicamente, regístralo como sobrante.
      </p>
      <label className="block">
        <span className={fieldLabelClass}>SKU *</span>
        <input className={fieldControlClass} style={ring} value={sku} onChange={(e) => setSku(e.target.value)} list="opl-skus" autoCapitalize="characters" />
        <datalist id="opl-skus">
          {skus.data?.map((s) => (
            <option key={s.sku} value={s.sku}>
              {s.description}
            </option>
          ))}
        </datalist>
        {known ? <span className="mt-1 block text-xs text-white/55">{known.description}</span> : null}
      </label>
      {!known && sku.trim() ? (
        <label className="block">
          <span className={fieldLabelClass}>Descripción (SKU que no viene en el formato)</span>
          <input className={fieldControlClass} style={ring} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={fieldLabelClass}>Ubicación</span>
          <input className={fieldControlClass} style={ring} value={location} onChange={(e) => setLocation(e.target.value)} autoCapitalize="characters" />
        </label>
        <label className="block">
          <span className={fieldLabelClass}>Cantidad *</span>
          <input
            className={`${fieldControlClass} tabular-nums`}
            style={ring}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^\d.,]/g, ''))}
          />
        </label>
      </div>
      <label className="block">
        <span className={fieldLabelClass}>Nota</span>
        <input className={fieldControlClass} style={ring} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Ej. ${label} sin registrar en el WMS`} />
      </label>
      <div className="flex gap-2">
        <PrimaryButton color="#fb923c" disabled={busy} onClick={save} className="flex-1">
          {busy ? 'Guardando…' : 'Registrar sobrante'}
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancelar</GhostButton>
      </div>
    </GlassCard>
  )
}

function ManageAuditBar({ audit, onDeleted }: { audit: OplAudit; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const pending = audit.line_count - audit.counted_lines
  return (
    <div className="mt-3 border-t border-neurale-border pt-3">
      <div className="flex flex-wrap gap-2">
        {audit.status === 'en_curso' ? (
          <GhostButton
            onClick={() => {
              const msg =
                pending > 0
                  ? `Quedan ${pending} ${audit.mapping.key_label} sin contar: al cerrar se consideran NO ENCONTRADOS y sus SKU pasan a Revisión de Discrepancias. ¿Cerrar la auditoría?`
                  : '¿Cerrar la auditoría? Ya no se podrá contar.'
              if (!window.confirm(msg)) return
              const note = window.prompt('Nota de cierre (opcional):') ?? ''
              closeAudit(audit.id, note).catch((e) => setError(errMsg(e)))
            }}
          >
            Cerrar auditoría
          </GhostButton>
        ) : (
          <GhostButton onClick={() => reopenAudit(audit.id).catch((e) => setError(errMsg(e)))}>Reabrir</GhostButton>
        )}
        <GhostButton
          className="hover:!text-rose-400"
          onClick={() =>
            window.confirm(`¿Eliminar ${audit.folio} con todos sus conteos? No se puede deshacer.`) &&
            deleteAudit(audit.id)
              .then(onDeleted)
              .catch((e) => setError(errMsg(e)))
          }
        >
          Eliminar
        </GhostButton>
      </div>
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
    </div>
  )
}
