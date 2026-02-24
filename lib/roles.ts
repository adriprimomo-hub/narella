export const USER_ROLES = ["admin", "recepcion", "staff", "caja", "solo_turnos"] as const
export type UserRole = (typeof USER_ROLES)[number]

export const DEFAULT_USER_ROLE: UserRole = "solo_turnos"

export const isUserRole = (role?: string | null): role is UserRole =>
  Boolean(role && USER_ROLES.includes(role as UserRole))

export const isAdminRole = (role?: string | null) => role === "admin"

export const isStaffRole = (role?: string | null) => role === "staff"

export const isCajaRole = (role?: string | null) => role === "caja"

export const isSoloTurnosRole = (role?: string | null) => role === "solo_turnos"

export const normalizeRole = (role?: string | null): UserRole => {
  if (isUserRole(role)) return role
  return DEFAULT_USER_ROLE
}

export const roleLabel = (role?: string | null) => {
  if (isAdminRole(role)) return "Administrador"
  if (isStaffRole(role)) return "Staff"
  if (isCajaRole(role)) return "Caja"
  if (isSoloTurnosRole(role)) return "Solo turnos"
  return "Recepcion"
}
