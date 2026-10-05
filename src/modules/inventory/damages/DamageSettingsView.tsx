import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

import { GlassCard } from '@/shared/components/GlassCard'

import {
  deleteOrigin,
  deletePolicy,
  fetchOrigins,
  fetchPolicies,
  fetchMailTo,
  fetchQrToken,
  isOffProductionHost,
  PUBLIC_APP_URL,
  publicFormUrl,
  regenerateQrToken,
  saveMailTo,
  saveOrigin,
  savePolicy,
  type DamageOrigin,
  type DamagePolicy,
} from './lib/damages'
import { printQrSheet } from './lib/print'
import {
  COLOR,
  ErrorText,
  GhostButton,
  Modal,
  PrimaryButton,
  errMsg,
  fieldControlClass,
  fieldLabelClass,
  ringStyle,
} from './ui'

/** QR del formulario + catálogos (departamentos con sus correos, políticas). Solo gestor de Inventory. */
export function DamageSettingsView() {
  return (
    <div className="space-y-8">
      <QrSection />
      <MailToSection />
      <OriginsSection />
      <PoliciesSection />
    </div>
  )
}

/* ---------- QR ---------- */

function QrSection() {
  const [token, setToken] = useState<string | null>(null)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = token ? publicFormUrl(token) : ''

  useEffect(() => {
    fetchQrToken()
      .then(setToken)
      .catch((e) => setError(errMsg(e)))
  }, [])

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#05070d', light: '#ffffff' } })
      .then(setDataUrl)
      .catch(() => setDataUrl(null))
  }, [url])

  async function regenerate() {
    setBusy(true)
    try {
      setToken(await regenerateQrToken())
      setConfirm(false)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-display text-base font-semibold text-white">QR del formulario de averías</h3>
      <GlassCard className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 justify-center rounded-xl bg-white p-3">
          {dataUrl ? <img src={dataUrl} alt="QR del formulario de averías" className="h-44 w-44" /> : <div className="h-44 w-44" />}
        </div>
        <div className="min-w-0 space-y-3 text-sm">
          <p className="text-white/65">
            Imprímelo y pégalo en las áreas. Al escanearlo, el colaborador llena el formulario sin iniciar sesión, solo con su
            código de empleado.
          </p>
          <p className="font-mono text-xs break-all text-white/45">{url || '…'}</p>
          <ErrorText>{error}</ErrorText>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton
              color={COLOR}
              disabled={!dataUrl}
              onClick={() => {
                try {
                  if (dataUrl) printQrSheet(dataUrl, url)
                } catch (e) {
                  setError(errMsg(e))
                }
              }}
            >
              Imprimir QR
            </PrimaryButton>
            <GhostButton
              disabled={!url}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                } catch {
                  setError('No se pudo copiar al portapapeles.')
                }
              }}
            >
              {copied ? 'Copiado ✓' : 'Copiar link'}
            </GhostButton>
            <GhostButton disabled={!url} onClick={() => window.open(url, '_blank')}>
              Abrir formulario
            </GhostButton>
            <GhostButton onClick={() => setConfirm(true)}>Regenerar QR</GhostButton>
          </div>
          <p className="text-xs text-white/40">
            El QR siempre apunta a la dirección oficial de NeurALE ({PUBLIC_APP_URL}), sin importar desde dónde abras esta
            pantalla. Quien lo escanee no necesita iniciar sesión en nada.
          </p>
          {isOffProductionHost() ? (
            <p className="text-xs text-[#fbbf24]">
              Estás en otra dirección ({window.location.origin}). El QR igual apunta a producción: no uses un QR generado
              antes de esta versión desde una vista previa de Vercel, porque esos piden iniciar sesión en Vercel.
            </p>
          ) : null}
        </div>
      </GlassCard>
      {confirm ? (
        <Modal
          title="Regenerar QR"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <GhostButton onClick={() => setConfirm(false)}>Cancelar</GhostButton>
              <PrimaryButton color="#f87171" disabled={busy} onClick={regenerate}>
                Regenerar
              </PrimaryButton>
            </>
          }
        >
          <p className="text-sm text-white/70">
            Los QR impresos actuales dejan de funcionar y hay que imprimir y pegar el nuevo. Úsalo si el link se filtró o llegan
            reportes falsos.
          </p>
        </Modal>
      ) : null}
    </section>
  )
}

/* ---------- Destinatario principal del correo ---------- */

function MailToSection() {
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const ring = ringStyle(COLOR)

  useEffect(() => {
    fetchMailTo()
      .then((v) => {
        setValue(v.join(', '))
        setSaved(v.join(', '))
      })
      .catch((e) => setError(errMsg(e)))
  }, [])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const list = value.split(/[,;\s]+/).filter(Boolean)
      await saveMailTo(list)
      const norm = list.map((x) => x.toLowerCase()).join(', ')
      setValue(norm)
      setSaved(norm)
      setOk(true)
      setTimeout(() => setOk(false), 2000)
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-base font-semibold text-white">Correo de seguimiento por mal manejo</h3>
        <p className="mt-1 text-sm text-white/50">
          El reporte de mal manejo de cada semana o mes genera un solo correo. <b>Para</b>: estos destinatarios (por ejemplo, gerencia del CD). <b>CC</b>: los jefes
          de las áreas involucradas, según los correos de cada departamento de abajo.
        </p>
      </div>
      <GlassCard className="space-y-3 p-5">
        <label className="block">
          <span className={fieldLabelClass}>Para (separados por coma; opcional)</span>
          <input
            className={fieldControlClass}
            style={ring}
            value={value}
            placeholder="gerente.cd@vidri.com.sv"
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton color={COLOR} disabled={busy || saved === null || value === saved} onClick={save}>
          {ok ? 'Guardado ✓' : 'Guardar'}
        </PrimaryButton>
      </GlassCard>
    </section>
  )
}

/* ---------- Departamentos (origen) ---------- */

function OriginsSection() {
  const [rows, setRows] = useState<DamageOrigin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<DamageOrigin> | null>(null)
  const load = () =>
    fetchOrigins(true)
      .then(setRows)
      .catch((e) => setError(errMsg(e)))
  useEffect(() => {
    void load()
  }, [])

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-white">Departamentos (origen de la avería)</h3>
          <p className="mt-1 text-sm text-white/50">Salen en el formulario del QR. Los correos de cada uno (sus jefes) van en copia del correo de mal manejo cuando el área está involucrada.</p>
        </div>
        <PrimaryButton color={COLOR} onClick={() => setEditing({ name: '', emails: [], sort_order: (rows?.length ?? 0) + 1, active: true })}>
          + Agregar departamento
        </PrimaryButton>
      </div>
      <ErrorText>{error}</ErrorText>
      <GlassCard className="divide-y divide-neurale-border/60">
        {(rows ?? []).map((o) => (
          <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className={o.active ? '' : 'opacity-50'}>
              <span className="font-medium text-white">{o.name}</span>
              {!o.active ? <span className="ml-2 text-xs text-white/50">(inactivo)</span> : null}
              <span className="block text-xs text-white/45">{o.emails.length ? o.emails.join(', ') : 'Sin correos'}</span>
            </div>
            <GhostButton onClick={() => setEditing(o)}>Editar</GhostButton>
          </div>
        ))}
        {rows?.length === 0 ? <p className="px-4 py-3 text-sm text-white/45">Sin departamentos.</p> : null}
      </GlassCard>
      {editing ? (
        <OriginModal
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      ) : null}
    </section>
  )
}

function OriginModal({ value, onClose, onSaved }: { value: Partial<DamageOrigin>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(value.name ?? '')
  const [emails, setEmails] = useState((value.emails ?? []).join(', '))
  const [order, setOrder] = useState(String(value.sort_order ?? 0))
  const [active, setActive] = useState(value.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ring = ringStyle(COLOR)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSaved()
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={value.id ? `Editar ${value.name}` : 'Nuevo departamento'}
      onClose={onClose}
      footer={
        <>
          {value.id ? (
            <GhostButton className="mr-auto" disabled={busy} onClick={() => run(() => deleteOrigin(value.id!))}>
              Eliminar
            </GhostButton>
          ) : null}
          <GhostButton onClick={onClose}>Cancelar</GhostButton>
          <PrimaryButton
            color={COLOR}
            disabled={busy}
            onClick={() =>
              run(() =>
                saveOrigin({
                  id: value.id,
                  name,
                  emails: emails.split(/[,;\s]+/).filter(Boolean),
                  sort_order: Number(order) || 0,
                  active,
                }),
              )
            }
          >
            Guardar
          </PrimaryButton>
        </>
      }
    >
      <label className="block">
        <span className={fieldLabelClass}>Nombre</span>
        <input className={fieldControlClass} style={ring} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Correos de los jefes del área (van en CC; separados por coma)</span>
        <textarea className={fieldControlClass} style={ring} rows={2} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="jefe.picking@vidri.com.sv, coordinador@vidri.com.sv" />
      </label>
      <div className="flex items-end gap-4">
        <label className="block w-28">
          <span className={fieldLabelClass}>Orden</span>
          <input className={fieldControlClass} style={ring} type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-white/75">
          <input type="checkbox" className="h-4 w-4 accent-[#a78bfa]" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo (aparece en el formulario)
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
    </Modal>
  )
}

/* ---------- Políticas ---------- */

function PoliciesSection() {
  const [rows, setRows] = useState<DamagePolicy[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Partial<DamagePolicy> | null>(null)
  const load = () =>
    fetchPolicies(true)
      .then(setRows)
      .catch((e) => setError(errMsg(e)))
  useEffect(() => {
    void load()
  }, [])

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-semibold text-white">Políticas de manejo de averías</h3>
          <p className="mt-1 text-sm text-white/50">Se revisan por SKU al trabajar un lote. No cumplir una = mal manejo.</p>
        </div>
        <PrimaryButton color={COLOR} onClick={() => setEditing({ label: '', description: '', sort_order: (rows?.length ?? 0) + 1, active: true })}>
          + Agregar política
        </PrimaryButton>
      </div>
      <ErrorText>{error}</ErrorText>
      <GlassCard className="divide-y divide-neurale-border/60">
        {(rows ?? []).map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className={p.active ? '' : 'opacity-50'}>
              <span className="font-medium text-white">{p.label}</span>
              {!p.active ? <span className="ml-2 text-xs text-white/50">(inactiva)</span> : null}
              {p.code === 'not_deducted' ? (
                <span className="ml-2 text-xs" style={{ color: COLOR }}>
                  se marca sola si el colaborador no marca "Sí, se descontó"
                </span>
              ) : null}
              {p.description ? <span className="block text-xs text-white/45">{p.description}</span> : null}
            </div>
            <GhostButton onClick={() => setEditing(p)}>Editar</GhostButton>
          </div>
        ))}
      </GlassCard>
      {editing ? (
        <PolicyModal
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      ) : null}
    </section>
  )
}

function PolicyModal({ value, onClose, onSaved }: { value: Partial<DamagePolicy>; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(value.label ?? '')
  const [description, setDescription] = useState(value.description ?? '')
  const [order, setOrder] = useState(String(value.sort_order ?? 0))
  const [active, setActive] = useState(value.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ring = ringStyle(COLOR)

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onSaved()
    } catch (e) {
      setError(errMsg(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={value.id ? 'Editar política' : 'Nueva política'}
      onClose={onClose}
      footer={
        <>
          {value.id ? (
            <GhostButton className="mr-auto" disabled={busy} onClick={() => run(() => deletePolicy(value.id!))}>
              Eliminar
            </GhostButton>
          ) : null}
          <GhostButton onClick={onClose}>Cancelar</GhostButton>
          <PrimaryButton
            color={COLOR}
            disabled={busy}
            onClick={() => run(() => savePolicy({ id: value.id, label, description, sort_order: Number(order) || 0, active }))}
          >
            Guardar
          </PrimaryButton>
        </>
      }
    >
      <label className="block">
        <span className={fieldLabelClass}>Política (lo que debía cumplirse)</span>
        <input className={fieldControlClass} style={ring} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. Rotulada oportunamente" />
      </label>
      <label className="block">
        <span className={fieldLabelClass}>Descripción (opcional)</span>
        <textarea className={fieldControlClass} style={ring} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <div className="flex items-end gap-4">
        <label className="block w-28">
          <span className={fieldLabelClass}>Orden</span>
          <input className={fieldControlClass} style={ring} type="number" value={order} onChange={(e) => setOrder(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-white/75">
          <input type="checkbox" className="h-4 w-4 accent-[#a78bfa]" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activa
        </label>
      </div>
      <ErrorText>{error}</ErrorText>
    </Modal>
  )
}
