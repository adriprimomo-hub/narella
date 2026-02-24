import { randomUUID } from "crypto"

const DEFAULT_TOKEN_TTL_HOURS = 48

const getTokenTtlHours = () => {
  const raw = Number.parseInt(process.env.CONFIRMATION_TOKEN_TTL_HOURS || "", 10)
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 24 * 30) : DEFAULT_TOKEN_TTL_HOURS
}

export const extractConfirmationToken = (paramsToken: string | undefined, url: URL) => {
  const raw = paramsToken ?? url.pathname.split("/").filter(Boolean).pop() ?? ""
  const decoded = (() => {
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  })()

  const candidate = decoded.match(/[0-9A-Za-z-]{20,}/)?.[0] ?? decoded
  const normalized = candidate.trim().replace(/[^A-Za-z0-9-]/g, "")

  return { raw, token: normalized }
}

export const buildConfirmationTokenExpiry = (from = new Date()) => {
  const ttlHours = getTokenTtlHours()
  return new Date(from.getTime() + ttlHours * 60 * 60 * 1000).toISOString()
}

export const isConfirmationTokenExpired = (expiresAt?: string | null) => {
  if (!expiresAt) return false
  const expires = new Date(expiresAt)
  if (!Number.isFinite(expires.getTime())) return false
  return expires.getTime() <= Date.now()
}

export const buildConfirmationTokenInsertPayload = (args: {
  turnoId: string
  usuarioId?: string | null
  token?: string | null
}) => ({
  turno_id: args.turnoId,
  usuario_id: args.usuarioId || null,
  token: args.token?.trim() || randomUUID(),
  estado: "pendiente",
  expires_at: buildConfirmationTokenExpiry(),
})
