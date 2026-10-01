import { formatDateTimeSV } from '@/modules/storage/isq/lib/isq'

import {
  batchFolio,
  mishandlingByDepartment,
  reportFolio,
  type BatchDetail,
  type DepartmentMishandling,
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

function failedMap(d: BatchDetail): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const f of d.findings) m.set(f.report_id, [...(m.get(f.report_id) ?? []), f.policy_label])
  return m
}

function reportsTable(d: BatchDetail, onlyIds?: Set<string>): string {
  const failed = failedMap(d)
  const rows = d.reports
    .filter((r) => !onlyIds || onlyIds.has(r.id))
    .map((r) => {
      const f = failed.get(r.id) ?? []
      return `<tr class="${f.length ? 'bad' : ''}">
        <td>${esc(reportFolio(r.folio))}</td>
        <td>${esc(formatDateTimeSV(r.created_at))}</td>
        <td>${esc(r.reporter_name)}<br><span style="color:#6b7280">${esc(r.reporter_code)}</span></td>
        <td>${esc(r.origin_name)}</td>
        <td><b>${esc(r.sku)}</b></td>
        <td class="num">${esc(r.quantity)}</td>
        <td>${r.deducted_from_location ? '<span class="ok-txt">Sí</span>' : '<span class="bad-txt">No</span>'}</td>
        <td>${nl2br(r.observation)}</td>
        <td>${f.length ? `<span class="bad-txt">${f.map(esc).join('<br>')}</span>` : '<span class="ok-txt">Cumple</span>'}</td>
      </tr>`
    })
    .join('')
  return `<table><thead><tr>
    <th>Folio</th><th>Reportada</th><th>Colaborador</th><th>Origen</th><th>SKU</th><th>Cant.</th><th>¿Descontada?</th><th>Observación del colaborador</th><th>Políticas no cumplidas</th>
  </tr></thead><tbody>${rows}</tbody></table>`
}

function batchMeta(d: BatchDetail, extra: [string, string][] = []): string {
  const b = d.batch
  const items: [string, string][] = [
    ['Lote', batchFolio(b.folio)],
    ['Iniciado', formatDateTimeSV(b.created_at)],
    ['Trabajado por', b.worked_by_name || '—'],
    ['Estado', b.status === 'actualizado' ? `ACTUALIZADO · ${b.closed_at ? formatDateTimeSV(b.closed_at) : ''}` : 'EN TRABAJO (sin confirmar)'],
    ...extra,
  ]
  return `<div class="meta">${items.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`
}

function deptBlock(g: DepartmentMishandling): string {
  const to = g.emails.length ? esc(g.emails.join(', ')) : 'sin correos configurados'
  const mail = g.notice?.emailed_at
    ? ` · notificado a ${to} (correo abierto ${esc(formatDateTimeSV(g.notice.emailed_at))})`
    : ` · correo pendiente (${to})`
  return `<div class="dept"><b>${esc(g.origin_name)}</b> · ${g.reports.length} avería(s) con mal manejo${mail}
  <div class="box" style="margin-top:4px">${g.notice?.note ? nl2br(g.notice.note) : '<span style="color:#9ca3af">Sin observación de seguimiento.</span>'}</div></div>`
}

const signatures = `<div class="sign"><div>Elaboró (Inventory)</div><div>Revisó</div><div>Autorizó</div></div>`

/** Reporte completo del lote: anexo del ajuste en el sistema de la empresa. */
export function printBatchReport(d: BatchDetail): void {
  const units = d.reports.reduce((s, r) => s + r.quantity, 0)
  const skus = new Set(d.reports.map((r) => r.sku)).size
  const groups = mishandlingByDepartment(d)
  const mishandled = groups.reduce((s, g) => s + g.reports.length, 0)
  const title = `Control de Averías · ${batchFolio(d.batch.folio)}`
  const body = `${headerHtml('Reporte de averías trabajadas', 'CD NNEO · VIDRI · Inventory · Control de Averías')}
    ${batchMeta(d, [
      ['Nº ajuste en sistema', d.batch.erp_adjustment_ref || '—'],
      ['Averías', String(d.reports.length)],
      ['Unidades · SKU distintos', `${units} · ${skus}`],
      ['Con mal manejo', String(mishandled)],
    ])}
    <h2>Detalle de averías</h2>
    ${reportsTable(d)}
    <h2>Mal manejo por departamento</h2>
    ${groups.length ? groups.map(deptBlock).join('') : '<div class="box">Todas las averías cumplieron las políticas de manejo.</div>'}
    <h2>Observación final de Inventory</h2>
    <div class="box">${d.batch.final_note ? nl2br(d.batch.final_note) : '<span style="color:#9ca3af">Sin observación.</span>'}</div>
    ${signatures}
    <footer>Generado en NeurALE · ${esc(formatDateTimeSV(new Date().toISOString()))}</footer>`
  openPrintWindow(title, body)
}

/** Reporte de mal manejo de un departamento (para adjuntar al correo de seguimiento). */
export function printDepartmentReport(d: BatchDetail, g: DepartmentMishandling): void {
  const ids = new Set(g.reports.map((x) => x.report.id))
  const title = `Mal manejo de averías · ${g.origin_name} · ${batchFolio(d.batch.folio)}`
  const body = `${headerHtml(`Mal manejo de averías · ${g.origin_name}`, 'CD NNEO · VIDRI · Inventory · Control de Averías')}
    ${batchMeta(d, [
      ['Departamento', g.origin_name],
      ['Averías con mal manejo', String(g.reports.length)],
      ['Unidades', String(g.reports.reduce((s, x) => s + x.report.quantity, 0))],
    ])}
    <h2>Averías que no cumplieron las políticas de manejo</h2>
    ${reportsTable(d, ids)}
    <h2>Seguimiento de Inventory</h2>
    <div class="box">${g.notice?.note ? nl2br(g.notice.note) : '<span style="color:#9ca3af">Sin observación de seguimiento.</span>'}</div>
    <div class="sign"><div>Inventory</div><div>Jefe de ${esc(g.origin_name)}</div><div>Gerencia CD</div></div>
    <footer>Generado en NeurALE · ${esc(formatDateTimeSV(new Date().toISOString()))}</footer>`
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

/* ---------- Correo de seguimiento ---------- */

export function mishandlingEmail(d: BatchDetail, g: DepartmentMishandling, note: string): { subject: string; body: string } {
  const subject = `Mal manejo de averías · ${g.origin_name} · ${batchFolio(d.batch.folio)}`
  const lines = g.reports.map(
    ({ report: r, failed }) =>
      `• ${reportFolio(r.folio)} · SKU ${r.sku} · ${r.quantity} u. · reportó ${r.reporter_name} (${formatDateTimeSV(r.created_at)})\n   No cumplió: ${failed.join(', ')}`,
  )
  const body = [
    'Buen día,',
    '',
    `Al trabajar las averías del lote ${batchFolio(d.batch.folio)}, Inventory detectó ${g.reports.length} avería(s) de ${g.origin_name} que no cumplieron las políticas de manejo:`,
    '',
    ...lines,
    '',
    note.trim() ? `Seguimiento:\n${note.trim()}` : '',
    '',
    'Se adjunta el reporte del departamento. Agradecemos reforzar las políticas de manejo de averías con el equipo.',
    '',
    `Saludos,\n${d.batch.worked_by_name || 'Inventory'}\nInventory · CD NNEO`,
  ]
    .filter((l, i, arr) => !(l === '' && arr[i - 1] === ''))
    .join('\n')
  return { subject, body }
}

/** mailto: armado. Outlook lo abre con destinatarios, asunto y cuerpo listos. */
export function mailtoHref(emails: string[], subject: string, body: string): string {
  return `mailto:${emails.map(encodeURIComponent).join(';')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`
}

/** Algunos clientes de correo cortan un mailto: muy largo (~2000 caracteres). */
export const MAILTO_SAFE_LENGTH = 1900
