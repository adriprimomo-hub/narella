import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { SESSION_COOKIE_MAX_AGE } from "./session"

const DEV_FALLBACK_SECRET = "dev-only-session-secret-change-me"

const isProduction = process.env.NODE_ENV === "production"

export type SessionTokenPayload = {
  userId: string
  issuedAt: number
  expiresAt: number
}

const getSessionSecret = () => {
  const raw = process.env.SESSION_SECRET?.trim()
  if (raw) return raw
  if (isProduction && process.env.ALLOW_INSECURE_SESSION_SECRET !== "true") {
    throw new Error("SESSION_SECRET no configurado. Definilo para producción.")
  }
  return DEV_FALLBACK_SECRET
}

const encodeBase64Url = (value: string) => Buffer.from(value, "utf8").toString("base64url")

const decodeBase64Url = (value: string) => {
  try {
    return Buffer.from(value, "base64url").toString("utf8")
  } catch {
    return ""
  }
}

const sign = (payload: string) => createHmac("sha256", getSessionSecret()).update(payload).digest("base64url")

const safeEqual = (left: string, right: string) => {
  const leftBuf = Buffer.from(left)
  const rightBuf = Buffer.from(right)
  if (leftBuf.length !== rightBuf.length) return false
  return timingSafeEqual(leftBuf, rightBuf)
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

export const createSessionToken = (userId: string) => {
  const issuedAt = nowSeconds()
  const expiresAt = issuedAt + SESSION_COOKIE_MAX_AGE
  const nonce = randomBytes(12).toString("hex")
  const payload = `${encodeBase64Url(userId)}.${issuedAt}.${expiresAt}.${nonce}`
  const signature = sign(payload)
  return `${payload}.${signature}`
}

const parseCurrentToken = (parts: string[]): SessionTokenPayload | null => {
  const [encodedUserId, issuedAtRaw, expiresAtRaw, nonce, signature] = parts
  if (!encodedUserId || !issuedAtRaw || !expiresAtRaw || !nonce || !signature) return null

  const payload = `${encodedUserId}.${issuedAtRaw}.${expiresAtRaw}.${nonce}`
  const expectedSignature = sign(payload)
  if (!safeEqual(signature, expectedSignature)) return null

  const issuedAt = Number.parseInt(issuedAtRaw, 10)
  const expiresAt = Number.parseInt(expiresAtRaw, 10)
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= nowSeconds()) return null

  const userId = decodeBase64Url(encodedUserId).trim()
  if (!userId) return null

  return { userId, issuedAt, expiresAt }
}

const parseLegacyToken = (parts: string[]): SessionTokenPayload | null => {
  const [encodedUserId, expiresAtRaw, nonce, signature] = parts
  if (!encodedUserId || !expiresAtRaw || !nonce || !signature) return null

  const payload = `${encodedUserId}.${expiresAtRaw}.${nonce}`
  const expectedSignature = sign(payload)
  if (!safeEqual(signature, expectedSignature)) return null

  const expiresAt = Number.parseInt(expiresAtRaw, 10)
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds()) return null

  const userId = decodeBase64Url(encodedUserId).trim()
  if (!userId) return null

  return {
    userId,
    issuedAt: Math.max(0, expiresAt - SESSION_COOKIE_MAX_AGE),
    expiresAt,
  }
}

export const parseSessionToken = (token: string | null | undefined): SessionTokenPayload | null => {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length === 5) return parseCurrentToken(parts)
  if (parts.length === 4) return parseLegacyToken(parts)
  return null
}
