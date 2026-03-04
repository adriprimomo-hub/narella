"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { registerSystemDialogHandlers } from "@/lib/system-dialogs"

type AlertDialogItem = {
  id: string
  type: "alert"
  message: string
  resolve: () => void
}

type ConfirmDialogItem = {
  id: string
  type: "confirm"
  message: string
  resolve: (value: boolean) => void
}

type QueueItem = AlertDialogItem | ConfirmDialogItem

const createDialogId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `dialog-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function SystemDialogsHost() {
  const [queue, setQueue] = useState<QueueItem[]>([])

  const current = useMemo(() => (queue.length > 0 ? queue[0] : null), [queue])

  const enqueue = useCallback((item: QueueItem) => {
    setQueue((prev) => [...prev, item])
  }, [])

  const dequeue = useCallback(() => {
    setQueue((prev) => prev.slice(1))
  }, [])

  const resolveCurrent = useCallback(
    (value?: boolean) => {
      if (!current) return
      if (current.type === "confirm") {
        current.resolve(Boolean(value))
      } else {
        current.resolve()
      }
      dequeue()
    },
    [current, dequeue],
  )

  const handleAlert = useCallback(
    (message: string) =>
      new Promise<void>((resolve) => {
        enqueue({
          id: createDialogId(),
          type: "alert",
          message,
          resolve,
        })
      }),
    [enqueue],
  )

  const handleConfirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        enqueue({
          id: createDialogId(),
          type: "confirm",
          message,
          resolve,
        })
      }),
    [enqueue],
  )

  useEffect(() => {
    const unregister = registerSystemDialogHandlers({
      alert: handleAlert,
      confirm: handleConfirm,
    })
    const nativeAlert = window.alert
    window.alert = (message?: unknown) => {
      void handleAlert(typeof message === "string" ? message : String(message ?? ""))
    }
    return () => {
      unregister()
      window.alert = nativeAlert
    }
  }, [handleAlert, handleConfirm])

  return (
    <Dialog open={Boolean(current)} onOpenChange={(open) => !open && resolveCurrent(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current?.type === "confirm" ? "Confirmar" : "Aviso"}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm whitespace-pre-wrap text-foreground">{current?.message || ""}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          {current?.type === "confirm" && (
            <Button type="button" variant="outline" onClick={() => resolveCurrent(false)}>
              Cancelar
            </Button>
          )}
          <Button type="button" onClick={() => resolveCurrent(true)}>
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
