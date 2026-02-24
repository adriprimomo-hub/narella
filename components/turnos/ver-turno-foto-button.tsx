"use client"

import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { EyeIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

type VerTurnoFotoButtonProps = {
  turnoId: string
  label?: string
  title?: string
  variant?: "default" | "outline" | "secondary" | "ghost"
  size?: "default" | "sm" | "lg"
  className?: string
}

export function VerTurnoFotoButton({
  turnoId,
  label = "Ver foto",
  title = "Foto del trabajo",
  variant = "outline",
  size = "sm",
  className,
}: VerTurnoFotoButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cacheBust, setCacheBust] = useState<number>(0)

  const imageSrc = useMemo(() => {
    if (!open) return ""
    return `/api/turnos/${turnoId}/foto?v=${cacheBust}`
  }, [open, turnoId, cacheBust])

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => {
          setLoadError(null)
          setLoading(true)
          setCacheBust(Date.now())
          setOpen(true)
        }}
        className={cn("gap-2", className)}
      >
        <EyeIcon className="h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {loading && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Cargando foto...
              </div>
            )}
            {imageSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc}
                alt="Foto del trabajo"
                className={cn("mx-auto max-h-[70vh] w-full rounded-md border object-contain", loading && "hidden")}
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false)
                  setLoadError("No se pudo cargar la foto.")
                }}
              />
            )}
            {!loading && loadError && <p className="text-sm text-destructive">{loadError}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
