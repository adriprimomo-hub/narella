type DateInput = Date | string | null | undefined

const pad2 = (value: number) => String(value).padStart(2, "0")

const toDate = (value: DateInput) => {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export const formatDate = (value: DateInput) => {
  const date = toDate(value)
  if (!date) return ""
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
}

export const formatDateTime = (value: DateInput) => {
  const date = toDate(value)
  if (!date) return ""
  return `${formatDate(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export const formatDateRange = (desde?: DateInput, hasta?: DateInput) => {
  const start = formatDate(desde || null)
  const end = formatDate(hasta || null)
  if (!start && !end) return ""
  if (!end) return `Desde ${start}`
  if (!start) return `Hasta ${end}`
  return `Desde ${start} hasta ${end}`
}
