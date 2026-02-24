import { NextResponse } from "next/server"
import { LOCALDB_SESSION_COOKIE, sessionCookieOptions } from "@/lib/localdb/session"

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(LOCALDB_SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 })
  return response
}
