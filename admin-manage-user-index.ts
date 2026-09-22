// Edge Function: admin-manage-user
//
// Único lugar donde se crean/editan cuentas reales de NeurALE (tabla
// `admin_users` + el usuario real en Supabase Auth). No se puede hacer esto
// desde el frontend con la anon key: crear un usuario CON la contraseña que
// elige un tercero (el admin) requiere la Admin API de Supabase Auth, que
// exige la service_role key — esa key nunca se pone en el frontend (regla
// obligatoria de ARCHITECTURE.md), así que vive únicamente aquí, como
// variable de entorno/secreto de esta función en el dashboard de Supabase.
//
// Cómo desplegar (sin instalar nada local): Supabase → Functions → Deploy a
// new function → pega este archivo. Luego, Functions → admin-manage-user →
// Secrets, agrega SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (los mismos
// valores del proyecto, visibles en Settings → API). El frontend la invoca
// con `supabase.functions.invoke('admin-manage-user', { body })`, que ya
// manda el token de sesión del usuario actual en el header Authorization.
//
// Reglas de negocio que valida (además de la RLS de `admin_users`, que no
// permite escribir esta tabla desde ningún otro lado):
//   - admin / gerencia: pueden crear o editar cualquier usuario, con
//     cualquier access_level y módulo.
//   - jefe_area: solo puede crear/editar usuarios con access_level
//     'operador' dentro de su propio módulo.
//   - operador: no puede crear ni editar usuarios.
//
// 2026-09-21: se agregan encabezados CORS (faltaban en la primera versión).
// Sin ellos, el navegador rechaza la llamada desde la app web con
// "Failed to send a request to the Edge Function" antes de que el código de
// abajo llegue a ejecutarse — no es un problema de permisos ni de datos.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type AccessLevel = 'admin' | 'gerencia' | 'jefe_area' | 'operador'
type ModuleRole = 'inbound' | 'storage' | 'picking' | 'outbound' | 'inventory'

interface CreatePayload {
  action: 'create'
  employee_id: string
  email: string
  password: string
  access_level: AccessLevel
  module: ModuleRole | null
}

interface UpdatePayload {
  action: 'update'
  user_id: string
  patch: {
    access_level?: AccessLevel
    module?: ModuleRole | null
    active?: boolean
    password?: string
  }
}

type Payload = CreatePayload | UpdatePayload

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  })
}

function shapeOk(access_level: AccessLevel, module: string | null) {
  if (access_level === 'admin' || access_level === 'gerencia') return module === null
  return !!module
}

/** El nivel de acceso del caller le permite dejar el registro resultante como quedaría. */
function callerCanApply(
  caller: { access_level: AccessLevel; module: string | null },
  target: { access_level: AccessLevel; module: string | null },
) {
  if (caller.access_level === 'admin' || caller.access_level === 'gerencia') return true
  if (caller.access_level === 'jefe_area') {
    return target.access_level === 'operador' && target.module === caller.module
  }
  return false
}

Deno.serve(async (req) => {
  // Preflight CORS: el navegador manda esto antes del POST real.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''

  // Cliente "como el usuario que llama" (anon key + su token) — sirve para
  // identificarlo y leer su propia fila de admin_users (permitido por RLS).
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: authData, error: authError } = await callerClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'no_autenticado' }, 401)

  const { data: callerRow, error: callerError } = await callerClient
    .from('admin_users')
    .select('access_level, module, active')
    .eq('auth_user_id', authData.user.id)
    .single()

  if (callerError || !callerRow || !callerRow.active) {
    return json({ error: 'sin_permiso' }, 403)
  }
  if (!['admin', 'gerencia', 'jefe_area'].includes(callerRow.access_level)) {
    return json({ error: 'sin_permiso' }, 403)
  }

  const caller = { access_level: callerRow.access_level as AccessLevel, module: callerRow.module as string | null }

  // Cliente con service_role — únicas escrituras reales a auth.users / admin_users.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'body_invalido' }, 400)
  }

  if (payload.action === 'create') {
    const { employee_id, email, password, access_level, module } = payload

    if (!employee_id || !email || !password || !access_level) {
      return json({ error: 'faltan_campos' }, 400)
    }
    if (!shapeOk(access_level, module)) {
      return json({ error: 'modulo_invalido_para_ese_nivel' }, 400)
    }
    if (!callerCanApply(caller, { access_level, module })) {
      return json({ error: 'sin_permiso_para_ese_nivel_o_modulo' }, 403)
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created.user) {
      return json({ error: createError?.message ?? 'no_se_pudo_crear_el_usuario' }, 400)
    }

    const { data: row, error: insertError } = await adminClient
      .from('admin_users')
      .insert({
        employee_id,
        auth_user_id: created.user.id,
        email,
        access_level,
        module,
        created_by: authData.user.id,
      })
      .select('id, employee_id, email, access_level, module, active, created_at')
      .single()

    if (insertError) {
      // No dejar un auth.users huérfano si falla el insert de admin_users.
      await adminClient.auth.admin.deleteUser(created.user.id)
      return json({ error: insertError.message }, 400)
    }

    return json({ data: row })
  }

  if (payload.action === 'update') {
    const { user_id, patch } = payload
    if (!user_id) return json({ error: 'faltan_campos' }, 400)

    const { data: target, error: targetError } = await adminClient
      .from('admin_users')
      .select('id, auth_user_id, access_level, module')
      .eq('id', user_id)
      .single()

    if (targetError || !target) return json({ error: 'usuario_no_encontrado' }, 404)

    const nextAccessLevel = patch.access_level ?? target.access_level
    const nextModule = patch.module !== undefined ? patch.module : target.module

    if (!shapeOk(nextAccessLevel, nextModule)) {
      return json({ error: 'modulo_invalido_para_ese_nivel' }, 400)
    }
    // El jefe_area debe poder aplicar tanto el estado actual como el nuevo.
    if (
      !callerCanApply(caller, { access_level: target.access_level, module: target.module }) ||
      !callerCanApply(caller, { access_level: nextAccessLevel, module: nextModule })
    ) {
      return json({ error: 'sin_permiso_para_ese_nivel_o_modulo' }, 403)
    }

    if (patch.password) {
      const { error: pwError } = await adminClient.auth.admin.updateUserById(target.auth_user_id, {
        password: patch.password,
      })
      if (pwError) return json({ error: pwError.message }, 400)
    }

    const { password: _password, ...rest } = patch
    const { data: row, error: updateError } = await adminClient
      .from('admin_users')
      .update(rest)
      .eq('id', user_id)
      .select('id, employee_id, email, access_level, module, active, created_at')
      .single()

    if (updateError) return json({ error: updateError.message }, 400)

    return json({ data: row })
  }

  return json({ error: 'accion_invalida' }, 400)
})
