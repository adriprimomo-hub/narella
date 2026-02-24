"use client"

import { UserRoundIcon } from "lucide-react"
import useSWR from "swr"
import { cn } from "@/lib/utils"

type Props = {
  username?: string | null
  userId?: string | null
  className?: string
  titlePrefix?: string
}

const fetcher = (url: string) =>
  fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)

export function UserBadge({ username, userId, className, titlePrefix = "Creado por" }: Props) {
  const hasIdentity = Boolean(username || userId)
  const shouldFetch = Boolean(userId && !username)
  const { data } = useSWR<{ users?: Array<{ id: string; username?: string }> }>(
    shouldFetch ? "/api/admin/users" : null,
    fetcher,
  )

  if (!hasIdentity) return null

  const resolvedUsername = username || (userId ? data?.users?.find((u) => u.id === userId)?.username : null)
  const label = resolvedUsername || (userId ? userId.slice(0, 8) : "-")
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      title={`${titlePrefix}: ${label}`}
    >
      <UserRoundIcon className="h-3.5 w-3.5" />
      <span className="truncate max-w-[160px]">{label}</span>
    </span>
  )
}
