import { NextResponse } from "next/server"

// Next.js proxy handler (reemplaza al middleware viejo)
export async function proxy() {
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
}
