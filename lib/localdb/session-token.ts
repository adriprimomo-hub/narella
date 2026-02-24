import "server-only"

import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { SESSION_COOKIE_MAX_AGE } from "./session"

const DEV_FALLBACK_SECRET = "dev-only-session-secret-change-me"

const isProduction = process.env.NODE_ENV === "production"

const getSessionSecret = () => {
  const raw = process.env.SESSION_SECRET?.trim()
  if (raw) return raw
  if (isProduction && process.env.ALLOW_INSECURE_SESSION_SECRET !== "true") {
    throw new Error("SESSION_SECRET no configurado. Definilo para producción.")
  }
  return DEV_FALLBACK_SECRET
}

const encodeBase64Url = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url")

const decodeBase64Url = (value: string) => {
  try {
    return Buffer.from(value, "base64url").toString("utf8")
  } catch {
    return ""
  }
}

const sign = (payload: string) =>
  createHmac("sha256", getSessionSecret()).update(payload).digest("base64url")

const safeEqual = (left: string, right: string) => {
  const leftBuf = Buffer.from(left)
  const rightBuf = Buffer.from(right)
  if (leftBuf.length !== rightBuf.length) return false
  return timingSafeEqual(leftBuf, rightBuf)
}

export const createSessionToken = (userId: string) => {
  const exp = Math.floor(Date.now() / 1000) + SESSION_COOKIE_MAX_AGE
  const nonce = randomBytes(12).toString("hex")
  const payload = `${encodeBase64Url(userId)}.${exp}.${nonce}`
  const signature = sign(payload)
  return `${payload}.${signature}`
}

export const parseSessionToken = (token: string | null | undefined) => {
  if (!token) return null
  const [encodedUserId, expRaw, nonce, signature] = token.split(".")
  if (!encodedUserId || !expRaw || !nonce || !signature) return null

  const payload = `${encodedUserId}.${expRaw}.${nonce}`
  const expectedSignature = sign(payload)
  if (!safeEqual(signature, expectedSignature)) return null

  const exp = Number.parseInt(expRaw, 10)
  if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null

  const userId = decodeBase64Url(encodedUserId).trim()
  if (!userId) return null
  return userId
}
