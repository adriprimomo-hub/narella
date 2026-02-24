import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { LOCALDB_SESSION_COOKIE } from "@/lib/localdb/session"

const PUBLIC_PATH_PREFIXES = ["/auth", "/confirmar", "/compartir"]

const isPublicPath = (pathname: string) =>
  PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const session = request.cookies.get(LOCALDB_SESSION_COOKIE)?.value
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
