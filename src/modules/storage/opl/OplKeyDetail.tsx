/**
 * Detalle por llave (LPN / ubicación) de una auditoría OPL: qué falta por contar,
 * quién contó qué y búsqueda por texto. Lo usan "Resultados y avance" (detalle de un
 * SKU al hacer clic y la vista "Por {llave}" con todas las llaves).
 *
 * Conteo ciego: quien solo cuenta nunca recibe la cantidad esperada (la función
 * storage_opl_audit_keys no la devuelve), así que aquí solo se muestran cantidades
 * a quien puede gestionar.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { Chip, GhostButton, fieldControlClass, ringStyle } from '@/modules/storage/isq/ui'
import { MODULES } from '@/shared/modules'

import { fetchAuditKeys, fmtNum, type AuditKey, type OplAudit } from './lib/opl'
import { Badge } from './ui'

const storage = MODULES.find((m) => m.id === 'storage')!
const C = storage.color
const ring = ringStyle(C)

/* ---------- Carga de llaves (con freno: a lo sumo una recarga cada 8 s) ---------- */

const MIN_REFRESH_MS = 8_000

export function useAuditKeys(auditId: string, tick: string, enabled: boolean) {
  const [data, setData] = useState<AuditKey[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const last = useRef(0)
  const hasData = useRef(false)

  useEffect(() => {
    setData(null)
    hasData.current = false
    last.current = 0
  }, [auditId])

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const run = () => {
      last.current = Date.now()
      fetchAuditKeys(auditId)
        .then((d) => {
          if (!alive) return
          hasData.current = true
          setData(d)
          setError(null)
        })
        .catch((e) => {
          if (!alive) return
          const msg = e instanceof Error ? e.message : String(e)
          setError(
            /storage_opl_audit_keys/.test(msg)
              ? 'Falta correr en Supabase el SQL 20261115120000_storage_opl_key_detail.sql para ver el detalle por llave.'
              : msg,
          )
        })
    }
    const wait = hasData.current ? Math.max(0, MIN_REFRESH_MS - (Date.now() - last.current)) : 0
    const t = setTimeout(run, wait)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [auditId, tick, enabled, nonce])

  return { data, error, reload: () => setNonce((n) => n + 1) }
}

/* ---------- Estado de cada llave ---------- */

export type KeyState = 'pendiente' | 'contado' | 'recontado' | 'sobrante'

export function keyState(k: AuditKey): KeyState {
  if (k.is_extra) return 'sobrante'
  if (k.recounted) return 'recontado'
  return k.counted ? 'contado' : 'pendiente'
}

const KEY_STATE_COLORS: Record<KeyState, string> = {
  pendiente: '#94a3b8',
  contado: '#22d3ee',
  recontado: '#facc15',
  sobrante: '#fb923c',
}

function keyStateLabel(st: KeyState, closed: boolean) {
  if (st === 'pendiente') return closed ? 'No encontrado' : 'Pendiente'
  return { contado: 'Contado', recontado: 'Recontado', sobrante: 'Sobrante' }[st]
}

/** Texto normalizado para buscar (mayúsculas, sin acentos ni espacios dobles). */
export const normSearch = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

/** ¿La llave coincide con el texto? Busca en llave, ubicación, SKU, descripción y columnas extra. */
export function keyMatches(k: AuditKey, q: string) {
  if (!q) return true
  const hay = [k.key_value, k.location, k.sku, k.description, ...Object.values(k.extra ?? {})]
  return hay.some((v) => v !== null && v !== undefined && normSearch(String(v)).includes(q))
}

const finalQty = (k: AuditKey) => (k.is_extra ? k.counted_qty : (k.recount_qty ?? k.counted_qty))

function fmtWhen(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const tz = 'America/El_Salvador'
  const day = (x: Date) => x.toLocaleDateString('es-SV', { timeZone: tz })
  const time = d.toLocaleTimeString('es-SV', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  })
  return day(d) === day(new Date()) ? time : `${d.toLocaleDateString('es-SV', { timeZone: tz, day: '2-digit', month: '2-digit' })} ${time}`
}

/* ---------- Tabla de llaves con filtros ---------- */

type KeyFilter = 'pendientes' | 'contados' | 'recontados' | 'sobrantes' | 'todos'
type KeySort = 'ubicacion' | 'llave' | 'sku'

const PAGE = 200

export function KeyTable({
  audit,
  keys,
  canManage,
  showSku,
  initialQuery = '',
  compact,
}: {
  audit: OplAudit
  keys: AuditKey[]
  canManage: boolean
  /** Vista con todas las llaves: muestra la columna SKU y permite ordenar por SKU. */
  showSku?: boolean
  initialQuery?: string
  compact?: boolean
}) {
  const label = audit.mapping.key_label
  const closed = audit.status === 'cerrada'
  const hasLocation = keys.some((k) => k.location) && audit.mapping.location !== audit.mapping.key
  const extraCols = audit.mapping.extras
  const pendingTotal = keys.filter((k) => keyState(k) === 'pendiente').length

  const [filter, setFilter] = useState<KeyFilter>(pendingTotal ? 'pendientes' : 'todos')
  const [query, setQuery] = useState(initialQuery)
  const [sort, setSort] = useState<KeySort>(hasLocation ? 'ubicacion' : 'llave')
  const [limit, setLimit] = useState(PAGE)

  const q = normSearch(query)
  const searched = useMemo(() => keys.filter((k) => keyMatches(k, q)), [keys, q])
  const counts = useMemo(() => {
    const c = {
      pendientes: 0,
      contados: 0,
      recontados: 0,
      sobrantes: 0,
      todos: searched.length,
    }
    for (const k of searched) {
      const st = keyState(k)
      if (st === 'pendiente') c.pendientes++
      else if (st === 'sobrante') c.sobrantes++
      else {
        c.contados++
        if (st === 'recontado') c.recontados++
      }
    }
    return c
  }, [searched])

  const rows = useMemo(() => {
    const f = searched.filter((k) => {
      const st = keyState(k)
      if (filter === 'pendientes') return st === 'pendiente'
      if (filter === 'contados') return st === 'contado' || st === 'recontado'
      if (filter === 'recontados') return st === 'recontado'
      if (filter === 'sobrantes') return st === 'sobrante'
      return true
    })
    const cmp = (a: string | null, b: string | null) => (a ?? '￿').localeCompare(b ?? '￿', 'es', { numeric: true })
    return [...f].sort((a, b) => {
      if (sort === 'sku') return cmp(a.sku, b.sku) || cmp(a.location, b.location) || cmp(a.key_value, b.key_value)
      if (sort === 'ubicacion') return cmp(a.location, b.location) || cmp(a.key_value, b.key_value)
      return cmp(a.key_value, b.key_value)
    })
  }, [searched, filter, sort])

  useEffect(() => setLimit(PAGE), [filter, q, sort])

  function exportCsv() {
    const qv = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const head = [
      label,
      ...(hasLocation ? ['Ubicación'] : []),
      'SKU',
      'Descripción',
      ...extraCols,
      'Estado',
      'Contó',
      'Hora',
      ...(canManage ? ['Cant. formato', 'Cant. contada', 'Diferencia'] : []),
    ]
    const body = rows.map((k) => {
      const st = keyState(k)
      const fin = finalQty(k)
      return [
        k.key_value,
        ...(hasLocation ? [k.location] : []),
        k.sku,
        k.description,
        ...extraCols.map((c) => k.extra?.[c] ?? ''),
        keyStateLabel(st, closed),
        k.recounted ? k.recount_by : k.counted_by,
        fmtWhen(k.recounted ? k.recount_at : k.counted_at),
        ...(canManage ? [k.expected, fin, fin !== null && k.expected !== null ? fin - k.expected : ''] : []),
      ]
    })
    const csv = '﻿' + [head, ...body].map((r) => r.map(qv).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `${audit.folio}_${filter}${showSku ? '' : `_${keys[0]?.sku ?? ''}`}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const chips: {
    id: KeyFilter
    text: string
    color: string
    n: number
    always?: boolean
  }[] = [
    {
      id: 'pendientes',
      text: closed ? 'No encontrados' : 'Pendientes',
      color: closed ? '#f87171' : '#94a3b8',
      n: counts.pendientes,
      always: true,
    },
    {
      id: 'contados',
      text: 'Contados',
      color: KEY_STATE_COLORS.contado,
      n: counts.contados,
    },
    {
      id: 'recontados',
      text: 'Recontados',
      color: KEY_STATE_COLORS.recontado,
      n: counts.recontados,
    },
    {
      id: 'sobrantes',
      text: 'Sobrantes',
      color: KEY_STATE_COLORS.sobrante,
      n: counts.sobrantes,
    },
    { id: 'todos', text: 'Todos', color: C, n: counts.todos, always: true },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          className={`${fieldControlClass} basis-full sm:basis-auto ${compact ? 'sm:max-w-xs' : 'sm:max-w-md'} flex-1`}
          style={ring}
          placeholder={`Buscar ${label}${hasLocation ? ', ubicación' : ''}${showSku ? ', SKU' : ''}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <GhostButton onClick={exportCsv} disabled={!rows.length}>
          Descargar lista (CSV)
        </GhostButton>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) =>
          c.n || c.always || filter === c.id ? (
            <Chip key={c.id} color={c.color} active={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.text} ({fmtNum(c.n)})
            </Chip>
          ) : null,
        )}
        <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs text-white/45">
          Ordenar:
          {hasLocation ? (
            <Chip color={C} active={sort === 'ubicacion'} onClick={() => setSort('ubicacion')}>
              Ubicación
            </Chip>
          ) : null}
          <Chip color={C} active={sort === 'llave'} onClick={() => setSort('llave')}>
            {label}
          </Chip>
          {showSku ? (
            <Chip color={C} active={sort === 'sku'} onClick={() => setSort('sku')}>
              SKU
            </Chip>
          ) : null}
        </span>
      </div>

      {!rows.length ? (
        <p className="py-2 text-sm text-white/45">
          {filter === 'pendientes' && !q ? `No queda ningún ${label} pendiente.` : 'Nada coincide con los filtros.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-[11px] tracking-wider text-white/45 uppercase">
                <th className="p-1.5">{label}</th>
                {hasLocation ? <th className="p-1.5">Ubicación</th> : null}
                {showSku ? <th className="p-1.5">SKU</th> : null}
                {extraCols.length ? <th className="p-1.5">Detalle</th> : null}
                <th className="p-1.5">Estado</th>
                <th className="p-1.5">Contó</th>
                {canManage ? (
                  <>
                    <th className="p-1.5 text-right">Formato</th>
                    <th className="p-1.5 text-right">Contado</th>
                    <th className="p-1.5 text-right">Dif.</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((k) => {
                const st = keyState(k)
                const fin = finalQty(k)
                const diff = canManage && fin !== null && k.expected !== null ? fin - k.expected : null
                const color = st === 'pendiente' && closed ? '#f87171' : KEY_STATE_COLORS[st]
                const who = k.recounted ? k.recount_by : k.counted_by
                const when = k.recounted ? k.recount_at : k.counted_at
                const extras = extraCols.map((c) => (k.extra?.[c] ? `${c}: ${k.extra[c]}` : null)).filter(Boolean)
                return (
                  <tr key={(k.is_extra ? 'x' : 'l') + k.key_value} className="border-t border-neurale-border align-top text-white/80">
                    <td className="p-1.5 font-medium whitespace-nowrap text-white">{k.key_value}</td>
                    {hasLocation ? <td className="p-1.5 whitespace-nowrap">{k.location ?? '—'}</td> : null}
                    {showSku ? (
                      <td className="p-1.5">
                        <p className="whitespace-nowrap text-white">{k.sku}</p>
                        <p className="max-w-[14rem] truncate text-xs text-white/45">{k.description}</p>
                      </td>
                    ) : null}
                    {extraCols.length ? <td className="p-1.5 text-xs text-white/55">{extras.join(' · ') || '—'}</td> : null}
                    <td className="p-1.5">
                      <Badge color={color}>{keyStateLabel(st, closed)}</Badge>
                    </td>
                    <td className="p-1.5 text-xs text-white/55">
                      {who ? (
                        <>
                          <span className="text-white/75">{who}</span>
                          <span className="block tabular-nums">{fmtWhen(when)}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    {canManage ? (
                      <>
                        <td className="p-1.5 text-right tabular-nums">{k.is_extra ? '—' : fmtNum(k.expected)}</td>
                        <td className="p-1.5 text-right tabular-nums">{fmtNum(fin)}</td>
                        <td className="p-1.5 text-right tabular-nums" style={{ color: diff ? '#f87171' : undefined }}>
                          {diff === null ? '—' : `${diff > 0 ? '+' : ''}${fmtNum(diff)}`}
                        </td>
                      </>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length > limit ? (
            <div className="mt-2 flex items-center gap-3 text-xs text-white/45">
              Mostrando {fmtNum(limit)} de {fmtNum(rows.length)}
              <GhostButton onClick={() => setLimit((l) => l + PAGE * 2)}>Mostrar más</GhostButton>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
