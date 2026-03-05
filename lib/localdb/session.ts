import { FIXED_TENANT_ID } from "@/lib/tenant-id"

export const LOCALDB_SESSION_COOKIE = "narella_session"
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: SESSION_COOKIE_MAX_AGE,
}

type TenantUser = { id: string; tenant_id?: string | null }

export const getTenantId = (user: TenantUser): string => FIXED_TENANT_ID || user.tenant_id || user.id
