"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { DownloadIcon, EyeIcon, Loader2Icon, Share2Icon } from "lucide-react"
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
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<"share" | "download" | null>(null)
  const [cacheBust, setCacheBust] = useState<number>(0)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof navigator === "undefined") return
    const ua = navigator.userAgent || ""
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(ua))
  }, [])

  const imageSrc = useMemo(() => {
    if (!open) return ""
    return `/api/turnos/${turnoId}/foto?v=${cacheBust}`
  }, [open, turnoId, cacheBust])

  const extensionFromMime = (mimeType: string) => {
    const normalized = (mimeType || "").toLowerCase()
    if (normalized.includes("png")) return "png"
    if (normalized.includes("webp")) return "webp"
    if (normalized.includes("gif")) return "gif"
    return "jpg"
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = objectUrl
    link.download = filename
    link.rel = "noopener"
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }

  const fetchPhotoFile = async () => {
    const res = await fetch(`/api/turnos/${turnoId}/foto?v=${Date.now()}`, { cache: "no-store" })
    if (!res.ok) {
      throw new Error("No se pudo obtener la foto.")
    }
    const blob = await res.blob()
    if (!blob.size) {
      throw new Error("La foto no tiene contenido.")
    }
    const mimeType = blob.type || "image/jpeg"
    const filename = `foto-trabajo-${turnoId}.${extensionFromMime(mimeType)}`
    const file = new File([blob], filename, { type: mimeType })
    return { blob, file, filename }
  }

  const handleShare = async () => {
    setActionError(null)
    setActionLoading("share")
    try {
      const { blob, file, filename } = await fetchPhotoFile()
      if (navigator.share) {
        const canShareFiles =
          typeof navigator.canShare === "function"
            ? navigator.canShare({ files: [file] })
            : true
        if (canShareFiles) {
          await navigator.share({
            files: [file],
            title: "Foto del trabajo",
            text: "Foto del trabajo",
          })
          return
        }
      }
      downloadBlob(blob, filename)
      alert("Este navegador no permite compartir archivos. Descargamos la foto para que la compartas manualmente.")
    } catch (error: any) {
      if (error?.name === "AbortError") return
      setActionError(error?.message || "No se pudo compartir la foto.")
    } finally {
      setActionLoading(null)
    }
  }

  const handleDownload = async () => {
    setActionError(null)
    setActionLoading("download")
    try {
      const { blob, file, filename } = await fetchPhotoFile()
      if (isMobile && navigator.share) {
        const canShareFiles =
          typeof navigator.canShare === "function"
            ? navigator.canShare({ files: [file] })
            : true
        if (canShareFiles) {
          try {
            await navigator.share({
              files: [file],
              title: "Guardar foto del trabajo",
            })
            return
          } catch (error: any) {
            if (error?.name === "AbortError") return
          }
        }
      }
      downloadBlob(blob, filename)
    } catch (error: any) {
      setActionError(error?.message || "No se pudo descargar la foto.")
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => {
          setLoadError(null)
          setActionError(null)
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
            {!loading && !loadError && actionError && <p className="text-sm text-destructive">{actionError}</p>}
            {!loadError && (
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDownload()}
                  disabled={loading || actionLoading !== null}
                  className="gap-2"
                >
                  {actionLoading === "download" ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <DownloadIcon className="h-4 w-4" />
                  )}
                  Descargar
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleShare()}
                  disabled={loading || actionLoading !== null}
                  className="gap-2"
                >
                  {actionLoading === "share" ? (
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  ) : (
                    <Share2Icon className="h-4 w-4" />
                  )}
                  Compartir
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
