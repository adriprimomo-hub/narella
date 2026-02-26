export const MEDIUM_LARGE_PAGE_SIZE = 60
const DEFAULT_MAX_PAGE_SIZE = 200

const resolvePositiveInt = (rawValue: string | null, fallback: number) => {
  const parsed = Number.parseInt(String(rawValue || fallback), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

export type PaginationParams = {
  enabled: boolean
  page: number
  pageSize: number
  from: number
  to: number
}

export type PaginationMeta = {
  page: number
  page_size: number
  has_prev: boolean
  has_next: boolean
}

export const readPaginationParams = (
  searchParams: URLSearchParams,
  options?: { defaultPageSize?: number; maxPageSize?: number },
): PaginationParams => {
  const defaultPageSize = options?.defaultPageSize ?? MEDIUM_LARGE_PAGE_SIZE
  const maxPageSize = options?.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE
  const enabled = searchParams.has("page") || searchParams.has("page_size")
  const page = resolvePositiveInt(searchParams.get("page"), 1)
  const requestedPageSize = resolvePositiveInt(searchParams.get("page_size"), defaultPageSize)
  const pageSize = Math.min(Math.max(requestedPageSize, 1), maxPageSize)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  return { enabled, page, pageSize, from, to }
}

export const buildPaginationMeta = (page: number, pageSize: number, hasNext: boolean): PaginationMeta => ({
  page,
  page_size: pageSize,
  has_prev: page > 1,
  has_next: hasNext,
})
