import { NextResponse } from "next/server"
import { z } from "zod"
import { localAdmin } from "@/lib/localdb/admin"
import { validateBody } from "@/lib/api/validation"

const TEST_LOGIN_USERNAME = "admin"
const TEST_LOGIN_PASSWORD = "admin"
const LIST_USERS_PER_PAGE = 200

const bootstrapSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
})

function isTestLoginAllowed() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_TEST_LOGIN === "true"
  )
}

async function findUserByUsername(username: string) {
  let page = 1
  while (true) {
    const { data, error } = await localAdmin.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PER_PAGE,
    })

    if (error) {
      return { user: null, error }
    }

    const match = data.users.find((candidate: any) => candidate.username?.toLowerCase() === username)
    if (match) {
      return { user: match, error: null }
    }

    if (!data.nextPage || page >= data.lastPage) {
      return { user: null, error: null }
    }

    page = data.nextPage
  }
}

export async function POST(request: Request) {
  if (!isTestLoginAllowed()) {
    return NextResponse.json({ error: "Test login disabled" }, { status: 403 })
  }

  const { data: payload, response: validationResponse } = await validateBody(request, bootstrapSchema)
  if (validationResponse) return validationResponse

  const username = payload.username.trim().toLowerCase()
  const password = payload.password

  if (username !== TEST_LOGIN_USERNAME || password !== TEST_LOGIN_PASSWORD) {
    return NextResponse.json({ error: "Invalid test credentials" }, { status: 400 })
  }

  const { user: existingUser, error: listError } = await findUserByUsername(username)
  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 500 })
  }

  let user = existingUser
  if (!user) {
    const { data: created, error: createError } = await localAdmin.auth.admin.createUser({
      username,
      password,
      email_confirm: true,
    })
    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 })
    }
    user = created?.user || null
  } else {
    const { error: updateError } = await localAdmin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    })
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
  }

  if (!user?.id) {
    return NextResponse.json({ error: "Test user missing" }, { status: 500 })
  }

  const { error: upsertError } = await localAdmin
    .from("usuarios")
    .upsert({ id: user.id, username, rol: "admin", tenant_id: user.id }, { onConflict: "id" })

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, user_id: user.id })
}
