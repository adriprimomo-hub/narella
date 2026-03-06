type TenantScopedRow = {
  id?: string | null
  usuario_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const parseDateToMs = (value: unknown) => {
  const raw = String(value || "").trim()
  if (!raw) return Number.NEGATIVE_INFINITY
  const ms = Date.parse(raw)
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY
}

export const pickTenantScopedRow = <T extends TenantScopedRow>(rows: T[] | null | undefined, tenantId: string): T | null => {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (list.length === 0) return null

  const exactTenantRows = list.filter((row) => String(row?.usuario_id || "") === tenantId)
  const candidates = exactTenantRows.length > 0 ? exactTenantRows : list

  const sorted = [...candidates].sort((a, b) => {
    const updatedDiff = parseDateToMs(b?.updated_at) - parseDateToMs(a?.updated_at)
    if (updatedDiff !== 0) return updatedDiff

    const createdDiff = parseDateToMs(b?.created_at) - parseDateToMs(a?.created_at)
    if (createdDiff !== 0) return createdDiff

    return String(a?.id || "").localeCompare(String(b?.id || ""))
  })

  return sorted[0] || null
}

export const selectTenantConfiguracionRow = async (
  db: any,
  tenantId: string,
  selectExpr: string,
  limit = 200,
): Promise<{ data: any; rows: any[]; error: any }> => {
  const { data, error } = await db.from("configuracion").select(selectExpr).eq("usuario_id", tenantId).limit(limit)
  if (error) return { data: null, rows: [], error }

  const rows = Array.isArray(data) ? data : []
  return {
    data: pickTenantScopedRow(rows as TenantScopedRow[], tenantId),
    rows,
    error: null,
  }
}

