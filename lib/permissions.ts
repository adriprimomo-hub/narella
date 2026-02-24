import { DEFAULT_USER_ROLE, isAdminRole, normalizeRole, type UserRole } from "@/lib/roles"

export const getUserRole = async (db: any, userId: string): Promise<UserRole> => {
  const { data, error } = await db.from("usuarios").select("rol").eq("id", userId).maybeSingle()

  if (error) {
    return DEFAULT_USER_ROLE
  }

  return normalizeRole(data?.rol || DEFAULT_USER_ROLE)
}

export const isAdminUser = (role?: string | null) => isAdminRole(role)

export const getEmpleadaIdForUser = async (db: any, userId: string): Promise<string | null> => {
  const { data } = await db.from("usuarios").select("empleada_id").eq("id", userId).maybeSingle()
  return data?.empleada_id || null
}
