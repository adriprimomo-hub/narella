import { NextResponse } from "next/server"
import { LOCALDB_SESSION_COOKIE, sessionCookieOptions } from "@/lib/localdb/session"
import { createClient } from "@/lib/localdb/server"

export async function POST() {
  try {
    const db = await createClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (user?.id) {
      const now = new Date().toISOString()
      await db
        .from("usuarios")
        .update({ session_invalid_before: now, updated_at: now })
        .eq("id", user.id)
    }
  } catch {
    // If session invalidation fails, we still clear the cookie below.
  }

  const response = NextResponse.json({ success: true })
  response.cookies.set(LOCALDB_SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 })
  return response
}
