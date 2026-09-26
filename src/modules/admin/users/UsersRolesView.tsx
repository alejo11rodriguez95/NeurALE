import { useEffect, useState } from 'react'

import type { AccessLevel, ModuleRole } from '@/lib/supabase'
import { fieldControlClass, fieldLabelClass, ringStyle } from '@/modules/admin/components/formStyles'
import { fetchEmployees, type Employee } from '@/modules/admin/lib/employees'
import { createUser, fetchUsers, updateUser, type AdminUserWithEmployee } from '@/modules/admin/lib/users'
import { GlassCard } from '@/shared/components/GlassCard'
import { useAuth } from '@/shared/auth/AuthContext'
import { ADMIN_SECTION, MODULES } from '@/shared/modules'

const ACCESS_LEVEL_LABEL: Record<AccessLevel, string> = {
  admin: 'Admin',
  gerencia: 'Gerencia',
  jefe_area: 'Jefe de área',
  operador: 'Operador',
}

/**
 * Crear cuentas de acceso real y asignar rol/módulo a empleados ya
 * registrados en el catálogo de Empleados. Un jefe_area solo puede crear
 * usuarios `operador` dentro de su propio módulo — la Edge Function
 * `admin-manage-user` valida lo mismo del lado del servidor, esto solo
 * simplifica la pantalla para que no vea opciones que no puede usar.
 */
export function UsersRolesView() {
  const { adminUser } = useAuth()
  const isJefeArea = adminUser?.access_level === 'jefe_area'

  const [users, setUsers] = useState<AdminUserWithEmployee[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [employeeId, setEmployeeId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(isJefeArea ? 'operador' : 'operador')
  const [module, setModule] = useState<ModuleRole | ''>(isJefeArea ? (adminUser?.module ?? '') : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reload() {
    Promise.all([fetchUsers(), fetchEmployees()]).then(([u, e]) => {
      setUsers(u)
      setEmployees(e.filter((emp) => emp.active))
    })
  }

  useEffect(() => {
    reload()
    setLoading(false)
  }, [])

  const availableAccessLevels: AccessLevel[] = isJefeArea
    ? ['operador']
    : ['admin', 'gerencia', 'jefe_area', 'operador']

  const needsModule = accessLevel === 'jefe_area' || accessLevel === 'operador'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!employeeId || !password.trim()) return
    if (needsModule && !module) {
      setError('Selecciona el módulo para este nivel de acceso.')
      return
    }
    setSaving(true)
    try {
      await createUser({
        employee_id: employeeId,
        email: email.trim(),
        password,
        access_level: accessLevel,
        module: needsModule ? (module as ModuleRole) : null,
      })
      setEmployeeId('')
      setEmail('')
      setPassword('')
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(user: AdminUserWithEmployee) {
    try {
      await updateUser(user.id, { active: !user.active })
      reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  const visibleUsers = isJefeArea
    ? users.filter((u) => u.access_level === 'operador' && u.module === adminUser?.module)
    : users

  if (loading) return <p className="text-sm text-white/40">Cargando…</p>

  return (
    <div className="flex flex-col gap-6">
      <GlassCard className="p-5">
        <h2 className="font-display text-base font-semibold text-white">+ Crear usuario</h2>
        <p className="mt-1 text-sm text-white/55">
          El empleado debe existir primero en el catálogo de Empleados.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={fieldLabelClass}>
            Empleado
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              required
            >
              <option value="">— Selecciona —</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_code} — {emp.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className={fieldLabelClass}>
            Correo (opcional)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Déjalo vacío si no tiene correo"
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
            />
            <span className="mt-1 block text-[11px] font-normal text-white/35">
              Sin correo, inicia sesión con su código de empleado.
            </span>
          </label>

          <label className={fieldLabelClass}>
            Contraseña temporal
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              minLength={6}
              required
            />
            <span className="mt-1 block text-[11px] font-normal text-white/35">
              El usuario deberá cambiarla al iniciar sesión por primera vez.
            </span>
          </label>

          <label className={fieldLabelClass}>
            Nivel de acceso
            <select
              value={accessLevel}
              onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}
              className={fieldControlClass}
              style={ringStyle(ADMIN_SECTION.color)}
              disabled={isJefeArea}
            >
              {availableAccessLevels.map((level) => (
                <option key={level} value={level}>
                  {ACCESS_LEVEL_LABEL[level]}
                </option>
              ))}
            </select>
          </label>

          {needsModule ? (
            <label className={fieldLabelClass}>
              Módulo
              <select
                value={module}
                onChange={(e) => setModule(e.target.value as ModuleRole)}
                className={fieldControlClass}
                style={ringStyle(ADMIN_SECTION.color)}
                disabled={isJefeArea}
                required
              >
                <option value="">— Selecciona —</option>
                {MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? <p className="text-sm text-neurale-red sm:col-span-2">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-neurale-bg disabled:opacity-50 sm:col-span-2 sm:w-fit"
            style={{ background: ADMIN_SECTION.color }}
          >
            {saving ? 'Creando…' : 'Crear usuario'}
          </button>
        </form>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-neurale-border text-left text-xs text-white/45 uppercase">
            <tr>
              <th className="px-4 py-3">Empleado</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3">Módulo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((u) => (
              <tr key={u.id} className="border-b border-neurale-border/60 last:border-0">
                <td className="px-4 py-3 text-white/80">{u.employee?.full_name ?? '—'}</td>
                <td className="px-4 py-3 text-white/70">
                  {u.email.endsWith('@neurale.local')
                    ? `Código ${u.employee?.employee_code ?? '—'} (sin correo)`
                    : u.email}
                </td>
                <td className="px-4 py-3 text-white/55">{ACCESS_LEVEL_LABEL[u.access_level]}</td>
                <td className="px-4 py-3 text-white/55">
                  {u.module ? MODULES.find((m) => m.id === u.module)?.label ?? u.module : '—'}
                </td>
                <td className="px-4 py-3 text-white/55">{u.active ? 'Activo' : 'Inactivo'}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleToggleActive(u)}
                    className="text-xs text-white/50 hover:text-white/80"
                  >
                    {u.active ? 'Desactivar' : 'Reactivar'}
                  </button>
                </td>
              </tr>
            ))}
            {visibleUsers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-white/40">
                  Sin usuarios todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </GlassCard>
    </div>
  )
}
