const normalizeUrl = (url: string) => {
  const trimmed = url.trim()
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

const getEnvUrl = () => {
  const candidates = [
    process.env.NEXT_PUBLIC_CONFIRMATION_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_PUBLIC_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
    process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter((value): value is string => Boolean(value && value.trim().length > 0))

  if (candidates.length > 0) {
    return normalizeUrl(candidates[0])
  }
}

export const resolveAppUrl = (options?: { headers?: Headers; fallbackOrigin?: string }) => {
  const fromEnv = getEnvUrl()

  if (fromEnv) {
    return normalizeUrl(fromEnv)
  }

  const headers = options?.headers
  const protoHeader = headers?.get("x-forwarded-proto") || headers?.get("forwarded-proto")
  let host =
    headers?.get("x-forwarded-host") ||
    headers?.get("forwarded-host") ||
    headers?.get("host")

  if ((!host || host.includes("localhost")) && options?.fallbackOrigin) {
    host = options.fallbackOrigin
  }

  if (host) {
    const isFullUrl = host.startsWith("http://") || host.startsWith("https://")
    const proto = protoHeader || (host.includes("localhost") || host.startsWith("127.") ? "http" : "https")
    const url = isFullUrl ? host : `${proto}://${host}`
    return normalizeUrl(url)
  }

  if (options?.fallbackOrigin) {
    return normalizeUrl(options.fallbackOrigin)
  }

  return "http://localhost:3000"
}
