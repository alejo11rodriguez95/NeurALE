import { formatDateTimeSV } from '@/modules/storage/isq/lib/isq'

import {
  NOT_APPLICABLE_LABEL,
  NOT_DEDUCTED_LABEL,
  batchFolio,
  periodLabel,
  reportFolio,
  type BatchDetail,
  type DamageFinding,
  type DamageReport,
  type DepartmentMishandling,
  type PeriodDetail,
} from './damages'

/**
 * Reportes imprimibles de Control de Averías. Se abren en una ventana aparte
 * con estilo de papel (fondo blanco, tinta oscura), independiente del tema
 * oscuro de NeurALE, y lanzan el diálogo de impresión del navegador — desde
 * ahí se imprime o se guarda como PDF (para anexarlo al ajuste en el sistema
 * de la empresa o adjuntarlo al correo de seguimiento).
 */

const esc = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const nl2br = (s: string | null | undefined) => esc(s).replace(/\n/g, '<br>')

const PAGE_CSS = `
  @page { size: letter; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "IBM Plex Sans", Arial, sans-serif; color: #111827; font-size: 11px; margin: 0; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #e30613; padding-bottom: 8px; margin-bottom: 12px; }
  header img { height: 38px; }
  h1 { font-size: 16px; margin: 0; }
  h2 { font-size: 12.5px; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: .04em; color: #374151; }
  .sub { color: #4b5563; margin-top: 2px; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 14px; margin-bottom: 10px; }
  .meta div span { display: block; color: #6b7280; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; }
  .meta div b { font-size: 11.5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 4px 5px; vertical-align: top; text-align: left; }
  th { background: #f3f4f6; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; }
  td.num { text-align: right; white-space: nowrap; }
  tr.bad td { background: #fef2f2; }
  .na { display: inline-block; margin-top: 2px; padding: 0 4px; border: 1px solid #d97706; border-radius: 3px; color: #b45309; font-size: 9px; font-weight: 600; }
  .bad-txt { color: #b91c1c; font-weight: 600; }
  .ok-txt { color: #15803d; }
  .box { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px; min-height: 34px; white-space: normal; }
  .dept { break-inside: avoid; margin-bottom: 10px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px; margin-top: 46px; }
  .sign div { border-top: 1px solid #111827; padding-top: 4px; text-align: center; color: #374151; }
  footer { margin-top: 18px; color: #9ca3af; font-size: 9px; }
  @media screen { body { padding: 24px; max-width: 1000px; margin: 0 auto; } }
`

function openPrintWindow(title: string, body: string): void {
  const w = window.open('', '_blank')
  if (!w) throw new Error('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio e inténtalo de nuevo.')
  w.document.open()
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${PAGE_CSS}</style></head><body>${body}
<script>window.addEventListener('load', function () { setTimeout(function () { window.focus(); window.print(); }, 250); });</script>
</body></html>`)
  w.document.close()
}

function headerHtml(title: string, subtitle: string): string {
  const logo = `${window.location.origin}/brand/logo-vidri.png`
  return `<header><div><h1>${esc(title)}</h1><div class="sub">${esc(subtitle)}</div></div><img src="${logo}" alt="VIDRI"></header>`
}

function failedMap(findings: DamageFinding[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const f of findings) m.set(f.report_id, [...(m.get(f.report_id) ?? []), f.policy_label])
  return m
}

const skuCell = (r: DamageReport) =>
  `<b>${esc(r.sku)}</b>${r.product_description ? `<br><span style="color:#374151">${esc(r.product_description)}</span>` : ''}`

/** Tabla de averías. `batchFolios`: agrega la columna Lote (reporte del período). */
function reportsTable(rows: DamageReport[], findings: DamageFinding[], opts: { batchFolios?: Record<string, number>; showNotApplicable?: boolean } = {}): string {
  const failed = failedMap(findings)
  const withBatch = !!opts.batchFolios
  const body = rows
    .map((r) => {
      const f = failed.get(r.id) ?? []
      const lote = withBatch ? `<td>${r.batch_id && opts.batchFolios![r.batch_id] ? esc(batchFolio(opts.batchFolios![r.batch_id])) : '—'}</td>` : ''
      const na = opts.showNotApplicable && r.not_applicable ? `<br><span class="na">${NOT_APPLICABLE_LABEL}</span>` : ''
      return `<tr class="${f.length ? 'bad' : ''}">
        <td>${esc(reportFolio(r.folio))}${na}</td>
        ${lote}
        <td>${esc(formatDateTimeSV(r.created_at))}</td>
        <td>${esc(r.reporter_name)}<br><span style="color:#6b7280">${esc(r.reporter_code)}</span></td>
        <td>${esc(r.origin_name)}</td>
        <td>${skuCell(r)}</td>
        <td class="num">${esc(r.quantity)}</td>
        <td>${r.deducted_from_location ? '<span class="ok-txt">Sí</span>' : `<span class="bad-txt">${NOT_DEDUCTED_LABEL}</span>`}</td>
        <td>${nl2br(r.observation)}</td>
        <td>${f.length ? `<span class="bad-txt">${f.map(esc).join('<br>')}</span>` : '<span class="ok-txt">Cumple</span>'}</td>
      </tr>`
    })
    .join('')
  return `<table><thead><tr>
    <th>Folio</th>${withBatch ? '<th>Lote</th>' : ''}<th>Reportada</th><th>Colaborador</th><th>Origen</th><th>SKU / descripción</th><th>Cant.</th><th>¿Descontada?</th><th>Observación del colaborador</th><th>Políticas no cumplidas</th>
  </tr></thead><tbody>${body}</tbody></table>`
}

function metaGrid(items: [string, string][]): string {
  return `<div class="meta">${items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`
}

const signatures = `<div class="sign"><div>Elaboró (Inventory)</div><div>Revisó</div><div>Autorizó</div></div>`
const footer = () => `<footer>Generado en NeurALE · ${esc(formatDateTimeSV(new Date().toISOString()))}</footer>`
const noteBox = (note: string | null | undefined, empty: string) =>
  `<div class="box">${note ? nl2br(note) : `<span style="color:#9ca3af">${esc(empty)}</span>`}</div>`

/**
 * Reporte del lote: anexo del ajuste en el sistema de la empresa. Las averías
 * marcadas "No aplica como avería" NO salen aquí (v3) — sí en el reporte de mal
 * manejo del período si incumplieron políticas.
 */
export function printBatchReport(d: BatchDetail): void {
  const rows = d.reports.filter((r) => !r.not_applicable)
  const units = rows.reduce((s, r) => s + r.quantity, 0)
  const skus = new Set(rows.map((r) => r.sku)).size
  const b = d.batch
  const title = `Control de Averías · ${batchFolio(b.folio)}`
  const body = `${headerHtml('Reporte de averías trabajadas', 'CD NNEO · VIDRI · Inventory · Control de Averías')}
    ${metaGrid([
      ['Lote', batchFolio(b.folio)],
      ['Iniciado', formatDateTimeSV(b.created_at)],
      ['Trabajado por', b.worked_by_name || '—'],
      ['Estado', b.status === 'actualizado' ? `ACTUALIZADO · ${b.closed_at ? formatDateTimeSV(b.closed_at) : ''}` : 'EN TRABAJO (sin confirmar)'],
      ['Nº ajuste en sistema', b.erp_adjustment_ref || '—'],
      ['Averías para ajuste', String(rows.length)],
      ['Unidades · SKU distintos', `${units} · ${skus}`],
    ])}
    <h2>Detalle de averías para ajuste</h2>
    ${rows.length ? reportsTable(rows, d.findings) : '<div class="box">Ninguna avería del lote aplica para ajuste.</div>'}
    <h2>Observación final de Inventory</h2>
    ${noteBox(b.final_note, 'Sin observación.')}
    ${signatures}
    ${footer()}`
  openPrintWindow(title, body)
}

function periodMeta(d: PeriodDetail, groups: DepartmentMishandling[]): string {
  const p = d.period
  const mishandled = groups.reduce((s, g) => s + g.reports.length, 0)
  return metaGrid([
    ['Período', periodLabel(p)],
    ['Estado', p.status === 'cerrado' ? `CERRADO · ${p.closed_at ? formatDateTimeSV(p.closed_at) : ''}` : 'ABIERTO (sin cerrar)'],
    ['Averías trabajadas', String(d.reports.length)],
    ['Con mal manejo', String(mishandled)],
    ['Áreas involucradas', String(groups.length)],
    ['Unidades con mal manejo', String(groups.reduce((s, g) => s + g.reports.reduce((t, x) => t + x.report.quantity, 0), 0))],
    [NOT_APPLICABLE_LABEL, String(d.reports.filter((r) => r.not_applicable).length)],
  ])
}

function emailStatus(d: PeriodDetail): string {
  const p = d.period
  if (!p.emailed_at) return 'Correo de seguimiento pendiente.'
  const cc = p.emailed_cc.length ? ` · CC: ${p.emailed_cc.join(', ')}` : ''
  return `Correo de seguimiento abierto ${formatDateTimeSV(p.emailed_at)} · Para: ${p.emailed_to.join(', ') || '—'}${cc}`
}

function deptSection(d: PeriodDetail, g: DepartmentMishandling, note: string): string {
  const jefes = g.emails.length ? `jefe(s): ${esc(g.emails.join(', '))}` : 'sin correo de jefe configurado'
  const units = g.reports.reduce((s, x) => s + x.report.quantity, 0)
  return `<h2>${esc(g.origin_name)} · ${g.reports.length} avería(s) · ${units} u.</h2>
    <div style="color:#4b5563;margin-bottom:4px">${jefes}</div>
    ${reportsTable(
      g.reports.map((x) => x.report),
      d.findings,
      { batchFolios: d.batchFolios, showNotApplicable: true },
    )}
    <div style="margin-top:6px"><b>Seguimiento de Inventory</b></div>
    ${noteBox(note, 'Sin observación de seguimiento.')}`
}

/** Reporte de mal manejo del período (todas las áreas): se adjunta al correo. */
export function printPeriodReport(d: PeriodDetail, groups: DepartmentMishandling[], notes: Record<string, string>, generalNote: string): void {
  const title = `Mal manejo de averías · ${periodLabel(d.period)}`
  const body = `${headerHtml('Reporte de mal manejo de averías', `CD NNEO · VIDRI · Inventory · ${periodLabel(d.period)}`)}
    ${periodMeta(d, groups)}
    <div style="color:#4b5563;margin-bottom:6px">${esc(emailStatus(d))}</div>
    ${groups.length ? groups.map((g) => deptSection(d, g, notes[g.origin_id] ?? g.note ?? '')).join('') : '<div class="box">Todas las averías del período cumplieron las políticas de manejo.</div>'}
    <h2>Observación general de Inventory</h2>
    ${noteBox(generalNote, 'Sin observación.')}
    ${signatures}
    ${footer()}`
  openPrintWindow(title, body)
}

/** Reporte de mal manejo de un área en el período. */
export function printPeriodDepartmentReport(d: PeriodDetail, g: DepartmentMishandling, note: string): void {
  const title = `Mal manejo de averías · ${g.origin_name} · ${periodLabel(d.period)}`
  const body = `${headerHtml(`Mal manejo de averías · ${g.origin_name}`, `CD NNEO · VIDRI · Inventory · ${periodLabel(d.period)}`)}
    ${metaGrid([
      ['Período', periodLabel(d.period)],
      ['Departamento', g.origin_name],
      ['Averías con mal manejo', String(g.reports.length)],
      ['Unidades', String(g.reports.reduce((s, x) => s + x.report.quantity, 0))],
    ])}
    ${deptSection(d, g, note)}
    <div class="sign"><div>Inventory</div><div>Jefe de ${esc(g.origin_name)}</div><div>Gerencia CD</div></div>
    ${footer()}`
  openPrintWindow(title, body)
}

/** Hoja imprimible con el QR del formulario (para pegar en el área). */
export function printQrSheet(qrDataUrl: string, url: string): void {
  const body = `<div style="text-align:center;padding-top:30px">
    <img src="${window.location.origin}/brand/logo-vidri.png" alt="VIDRI" style="height:46px">
    <h1 style="font-size:30px;margin:22px 0 4px">Reporte de averías</h1>
    <div style="font-size:15px;color:#374151">Escanea con la cámara del celular y llena el formulario</div>
    <img src="${qrDataUrl}" alt="QR" style="width:330px;height:330px;margin:26px auto;display:block">
    <div style="font-size:13px;color:#374151">Necesitas tu <b>código de empleado</b>.</div>
    <div style="font-size:9px;color:#9ca3af;margin-top:28px;word-break:break-all">${esc(url)}</div>
  </div>`
  openPrintWindow('QR · Reporte de averías', body)
}

/* ---------- Correo de seguimiento (uno solo por período) ---------- */

function policyTally(g: DepartmentMishandling): string {
  const counts = new Map<string, number>()
  for (const x of g.reports) for (const f of x.failed) counts.set(f, (counts.get(f) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} (${n})`)
    .join(', ')
}

/**
 * Correo único del período, estructurado por área. `body` es el resumen que va
 * en el correo armado (corto, para que Outlook no lo corte); `detail` agrega la
 * lista de averías de cada área (botón "Copiar texto del correo"). Los jefes
 * de las áreas involucradas van en copia — ver `involvedCc`.
 */
export function periodMishandlingEmail(
  d: PeriodDetail,
  groups: DepartmentMishandling[],
  notes: Record<string, string>,
  generalNote: string,
  sender: string,
): { subject: string; body: string; detail: string } {
  const label = periodLabel(d.period)
  const total = groups.reduce((s, g) => s + g.reports.length, 0)
  const subject = `Mal manejo de averías · ${label} · ${groups.map((g) => g.origin_name).join(', ')}`
  const section = (g: DepartmentMishandling, withList: boolean) => {
    const units = g.reports.reduce((s, x) => s + x.report.quantity, 0)
    const note = (notes[g.origin_id] ?? g.note ?? '').trim()
    const lines = withList
      ? g.reports.map(({ report: r, failed }) => {
          const lote = r.batch_id && d.batchFolios[r.batch_id] ? ` · ${batchFolio(d.batchFolios[r.batch_id])}` : ''
          const na = r.not_applicable ? ` · ${NOT_APPLICABLE_LABEL}` : ''
          return `   • ${reportFolio(r.folio)} · SKU ${r.sku}${r.product_description ? ` (${r.product_description})` : ''} · ${r.quantity} u. · reportó ${r.reporter_name}${lote}${na}\n     No cumplió: ${failed.join(', ')}`
        })
      : []
    return [
      `■ ${g.origin_name.toUpperCase()} — ${g.reports.length} avería(s), ${units} u.`,
      `   Políticas incumplidas: ${policyTally(g)}`,
      ...lines,
      note ? `   Seguimiento: ${note}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  }
  const build = (withList: boolean) =>
    [
      'Buen día,',
      '',
      `Compartimos el reporte de mal manejo de averías de la ${label.charAt(0).toLowerCase()}${label.slice(1)}. De ${d.reports.length} avería(s) trabajada(s) por Inventory, ${total} no cumplieron las políticas de manejo. Detalle por área:`,
      '',
      groups.map((g) => section(g, withList)).join('\n\n'),
      '',
      generalNote.trim() ? `Observación general: ${generalNote.trim()}\n` : '',
      withList ? '' : 'El detalle de cada avería va en el reporte adjunto (PDF).',
      'Agradecemos a cada jefe de área reforzar las políticas de manejo de averías con su equipo.',
      '',
      `Saludos,\n${sender || 'Inventory'}\nInventory · CD NNEO`,
    ]
      .filter((x, i, arr) => x !== '' || arr[i - 1] !== '')
      .join('\n')
  return { subject, body: build(false), detail: build(true) }
}

/** mailto: armado (Para + CC). Outlook lo abre con destinatarios, asunto y cuerpo listos. */
export function mailtoHref(to: string[], cc: string[], subject: string, body: string): string {
  const params = [
    cc.length ? `cc=${cc.map(encodeURIComponent).join(';')}` : '',
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`,
  ].filter(Boolean)
  return `mailto:${to.map(encodeURIComponent).join(';')}?${params.join('&')}`
}

/** Algunos clientes de correo cortan un mailto: muy largo (~2000 caracteres). */
export const MAILTO_SAFE_LENGTH = 1900
