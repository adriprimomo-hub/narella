import { localAdmin } from "@/lib/localdb/admin"
import { createClient } from "@/lib/localdb/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { validateBody } from "@/lib/api/validation"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"

const createUserSchema = z.object({
  user_id: z.string().min(1),
  username: z.string().trim().min(1),
  tenant_id: z.string().min(1).optional(),
})

export async function POST(request: Request) {
  try {
    const db = await createClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const role = await getUserRole(db, user.id)
    if (!isAdminRole(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: payload, response: validationResponse } = await validateBody(request, createUserSchema)
    if (validationResponse) return validationResponse
    const { user_id, username, tenant_id } = payload
    const currentTenantId = user.tenant_id || user.id

    const { error } = await localAdmin.from("usuarios").upsert(
      {
        id: user_id,
        username,
        rol: "recepcion",
        tenant_id: tenant_id || currentTenantId,
      },
      { onConflict: "id" },
    )

    if (error) {
      console.error("Error creating user:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error in create-user route:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

