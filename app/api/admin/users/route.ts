import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/localdb/server"
import { localAdmin } from "@/lib/localdb/admin"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole, normalizeRole } from "@/lib/roles"
import { validateBody } from "@/lib/api/validation"
import { maybeHashPassword } from "@/lib/auth/password"
import { FIXED_TENANT_ID } from "@/lib/tenant-id"

const createUserSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  rol: z.string().optional(),
  empleada_id: z.string().optional().nullable(),
})

const updateUserSchema = z.object({
  id: z.string().min(1),
  username: z.string().trim().min(1).optional(),
  password: z.string().min(1).optional(),
  rol: z.string().optional(),
  empleada_id: z.string().optional().nullable(),
})

const deleteUserSchema = z.object({
  id: z.string().min(1),
})

type TenantScope = {
  tenantId: string
  tenantUserIds: string[]
}

type AdminContext = {
  db: any
  user: any
  tenantId: string | null
  tenantUserIds: string[]
  response: NextResponse | null
}

const resolveTenantScope = async (tenantId: string): Promise<{ data: TenantScope | null; error: string | null }> => {
  const ids = new Set<string>([tenantId])

  const { data: ownerRows, error: ownerError } = await localAdmin.from("usuarios").select("id").eq("id", tenantId).limit(1)
  if (ownerError) return { data: null, error: ownerError.message }
  ;(ownerRows || []).forEach((row: any) => {
    if (row?.id) ids.add(String(row.id))
  })

  const { data: tenantRows, error: tenantError } = await localAdmin.from("usuarios").select("id").eq("tenant_id", tenantId)
  if (tenantError) return { data: null, error: tenantError.message }
  ;(tenantRows || []).forEach((row: any) => {
    if (row?.id) ids.add(String(row.id))
  })

  return {
    data: {
      tenantId,
      tenantUserIds: Array.from(ids),
    },
    error: null,
  }
}

const isInTenantScope = (id: string, tenantUserIds: string[]) => tenantUserIds.includes(id)

const isTenantOwnerUser = async (userId: string, tenantUserIds: string[]) => {
  const { data, error } = await localAdmin
    .from("usuarios")
    .select("id")
    .eq("tenant_id", userId)
    .neq("id", userId)
    .in("id", tenantUserIds)
    .limit(1)

  if (error) return { isOwner: false, error: error.message }
  return { isOwner: (data || []).length > 0, error: null as string | null }
}

const validateEmpleadaScope = async (empleadaId: string, tenantUserIds: string[]) => {
  const { data, error } = await localAdmin
    .from("empleadas")
    .select("id, usuario_id")
    .eq("id", empleadaId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: "Empleada no encontrada" }
  if (!isInTenantScope(String(data.usuario_id), tenantUserIds)) {
    return { ok: false, error: "La empleada no pertenece a tu tenant" }
  }
  return { ok: true, error: null }
}

const requireAdmin = async (): Promise<AdminContext> => {
  const db = await createClient()
  const {
    data: { user },
  } = await db.auth.getUser()

  if (!user) {
    return { db, user: null, tenantId: null, tenantUserIds: [], response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const role = await getUserRole(db, user.id)
  if (!isAdminRole(role)) {
    return { db, user, tenantId: null, tenantUserIds: [], response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  const tenantId = user.tenant_id || user.id
  if (!tenantId) {
    return {
      db,
      user,
      tenantId: null,
      tenantUserIds: [],
      response: NextResponse.json({ error: "Tenant no resuelto para el usuario autenticado" }, { status: 500 }),
    }
  }

  const { data: scope, error: scopeError } = await resolveTenantScope(tenantId)
  if (scopeError || !scope) {
    return {
      db,
      user,
      tenantId,
      tenantUserIds: [],
      response: NextResponse.json({ error: scopeError || "No se pudo resolver el tenant scope" }, { status: 500 }),
    }
  }

  return { db, user, tenantId, tenantUserIds: scope.tenantUserIds, response: null }
}

export async function GET() {
  const { response, tenantUserIds } = await requireAdmin()
  if (response) return response

  const { data: perfiles, error: perfilesError } = await localAdmin
    .from("usuarios")
    .select("id, username, rol, empleada_id, created_at, updated_at")
    .in("id", tenantUserIds)
    .order("username", { ascending: true })
  if (perfilesError) return NextResponse.json({ error: perfilesError.message }, { status: 500 })

  const list = (perfiles || []).map((perfil: any) => ({
    id: perfil.id,
    username: perfil.username || "",
    rol: normalizeRole(perfil.rol),
    empleada_id: perfil.empleada_id || null,
    created_at: perfil.created_at || null,
    updated_at: perfil.updated_at || null,
  }))
  return NextResponse.json({ users: list })
}

export async function POST(request: Request) {
  const { response, tenantUserIds } = await requireAdmin()
  if (response) return response

  const { data: payload, response: validationResponse } = await validateBody(request, createUserSchema)
  if (validationResponse) return validationResponse

  const username = payload.username.toLowerCase()
  const password = payload.password
  const rol = normalizeRole(payload.rol)
  const empleadaId = payload.empleada_id ? payload.empleada_id.toString() : null
  const hashedPassword = await maybeHashPassword(password)

  if (rol === "staff") {
    if (!empleadaId) {
      return NextResponse.json({ error: "Debes seleccionar una empleada para usuarios staff" }, { status: 400 })
    }
    const empleadaScope = await validateEmpleadaScope(empleadaId, tenantUserIds)
    if (!empleadaScope.ok) {
      return NextResponse.json({ error: empleadaScope.error }, { status: 400 })
    }
  }

  const { data: existingTenantUsernameRows, error: existingUsernameError } = await localAdmin
    .from("usuarios")
    .select("id")
    .eq("username", username)
    .in("id", tenantUserIds)
    .limit(1)
  if (existingUsernameError) return NextResponse.json({ error: existingUsernameError.message }, { status: 500 })
  if ((existingTenantUsernameRows || []).length > 0) {
    return NextResponse.json({ error: "El username ya existe en tu tenant" }, { status: 409 })
  }

  const { data: createdUser, error: createError } = await localAdmin
    .from("usuarios")
    .insert({
      username,
      password_hash: hashedPassword,
      rol,
      tenant_id: FIXED_TENANT_ID,
      empleada_id: rol === "staff" ? empleadaId : null,
    })
    .select("id")
    .maybeSingle()

  if (createError) {
    const message = String(createError.message || "")
    const lowerMessage = message.toLowerCase()
    const isUsernameConflict =
      String((createError as { code?: string }).code || "") === "23505" && lowerMessage.includes("username")
    if (isUsernameConflict) {
      return NextResponse.json({ error: "El username ya existe en tu tenant" }, { status: 409 })
    }
    return NextResponse.json({ error: message || "No se pudo crear el usuario" }, { status: 400 })
  }

  const newUserId = createdUser?.id || null
  if (!newUserId) return NextResponse.json({ error: "No se pudo resolver el id del nuevo usuario" }, { status: 500 })

  return NextResponse.json({ success: true, user_id: newUserId })
}

export async function PUT(request: Request) {
  const { response, tenantUserIds } = await requireAdmin()
  if (response) return response

  const { data: payload, response: validationResponse } = await validateBody(request, updateUserSchema)
  if (validationResponse) return validationResponse

  const id = payload.id
  if (!isInTenantScope(id, tenantUserIds)) {
    return NextResponse.json({ error: "Usuario no encontrado en tu tenant" }, { status: 404 })
  }

  const username = payload.username ? payload.username.toLowerCase() : ""
  const password = payload.password || ""
  const requestedRole = payload.rol ? normalizeRole(payload.rol) : null
  const requestedEmpleadaId = payload.empleada_id === undefined ? undefined : payload.empleada_id ? payload.empleada_id.toString() : null

  const { data: targetUser, error: targetUserError } = await localAdmin
    .from("usuarios")
    .select("id, rol, empleada_id")
    .eq("id", id)
    .in("id", tenantUserIds)
    .maybeSingle()
  if (targetUserError) return NextResponse.json({ error: targetUserError.message }, { status: 500 })
  if (!targetUser) return NextResponse.json({ error: "Usuario no encontrado en tu tenant" }, { status: 404 })

  const currentRole = normalizeRole(targetUser.rol)
  const nextRole = requestedRole || currentRole
  let nextEmpleadaId = targetUser?.empleada_id ? String(targetUser.empleada_id) : null
  if (requestedEmpleadaId !== undefined) {
    nextEmpleadaId = requestedEmpleadaId
  }
  if (nextRole !== "staff") {
    nextEmpleadaId = null
  }

  if (username) {
    const { data: existingUsernameRows, error: existingUsernameError } = await localAdmin
      .from("usuarios")
      .select("id")
      .eq("username", username)
      .in("id", tenantUserIds)
      .neq("id", id)
      .limit(1)
    if (existingUsernameError) return NextResponse.json({ error: existingUsernameError.message }, { status: 500 })
    if ((existingUsernameRows || []).length > 0) {
      return NextResponse.json({ error: "El username ya existe en tu tenant" }, { status: 409 })
    }
  }

  if (nextRole === "staff") {
    if (!nextEmpleadaId) {
      return NextResponse.json({ error: "Debes seleccionar una empleada para usuarios staff" }, { status: 400 })
    }
    const empleadaScope = await validateEmpleadaScope(nextEmpleadaId, tenantUserIds)
    if (!empleadaScope.ok) {
      return NextResponse.json({ error: empleadaScope.error }, { status: 400 })
    }
  }

  const authUpdates: Record<string, string | boolean> = {}
  if (password) authUpdates.password = password
  if (Object.keys(authUpdates).length > 0) {
    authUpdates.email_confirm = true
    const { error: updateError } = await localAdmin.auth.admin.updateUserById(id, authUpdates)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  const perfilUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (username) perfilUpdates.username = username
  if (password) perfilUpdates.password_hash = await maybeHashPassword(password)
  if (requestedRole) perfilUpdates.rol = requestedRole
  if (requestedRole || payload.empleada_id !== undefined || nextRole !== currentRole) {
    perfilUpdates.empleada_id = nextRole === "staff" ? nextEmpleadaId : null
  }

  if (Object.keys(perfilUpdates).length > 1) {
    const { error: perfilError } = await localAdmin.from("usuarios").update(perfilUpdates).eq("id", id).in("id", tenantUserIds)
    if (perfilError) return NextResponse.json({ error: perfilError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { response, user, tenantId, tenantUserIds } = await requireAdmin()
  if (response) return response

  const url = new URL(request.url)
  const idParam = url.searchParams.get("id")
  if (idParam) {
    const parsed = deleteUserSchema.safeParse({ id: idParam })
    if (!parsed.success) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 })
    }
    if (!isInTenantScope(parsed.data.id, tenantUserIds)) {
      return NextResponse.json({ error: "Usuario no encontrado en tu tenant" }, { status: 404 })
    }
    if (parsed.data.id === user?.id) {
      return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 })
    }
    if (parsed.data.id === tenantId) {
      return NextResponse.json({ error: "No puedes eliminar el usuario admin owner del tenant" }, { status: 400 })
    }
    const ownerCheck = await isTenantOwnerUser(parsed.data.id, tenantUserIds)
    if (ownerCheck.error) return NextResponse.json({ error: ownerCheck.error }, { status: 500 })
    if (ownerCheck.isOwner) {
      return NextResponse.json({ error: "No puedes eliminar el usuario owner del tenant" }, { status: 400 })
    }

    const { error: deleteError } = await localAdmin.auth.admin.deleteUser(parsed.data.id)
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })
    await localAdmin.from("usuarios").delete().eq("id", parsed.data.id).in("id", tenantUserIds)
    return NextResponse.json({ success: true })
  }

  const { data: payload, response: validationResponse } = await validateBody(request, deleteUserSchema)
  if (validationResponse) return validationResponse

  if (!isInTenantScope(payload.id, tenantUserIds)) {
    return NextResponse.json({ error: "Usuario no encontrado en tu tenant" }, { status: 404 })
  }
  if (payload.id === user?.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 })
  }
  if (payload.id === tenantId) {
    return NextResponse.json({ error: "No puedes eliminar el usuario admin owner del tenant" }, { status: 400 })
  }
  const ownerCheck = await isTenantOwnerUser(payload.id, tenantUserIds)
  if (ownerCheck.error) return NextResponse.json({ error: ownerCheck.error }, { status: 500 })
  if (ownerCheck.isOwner) {
    return NextResponse.json({ error: "No puedes eliminar el usuario owner del tenant" }, { status: 400 })
  }

  const { error: deleteError } = await localAdmin.auth.admin.deleteUser(payload.id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })

  await localAdmin.from("usuarios").delete().eq("id", payload.id).in("id", tenantUserIds)

  return NextResponse.json({ success: true })
}
