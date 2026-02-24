"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Share2Icon } from "lucide-react"
import { createShareLink } from "@/lib/share-links-client"

export type GiftcardPreviewInfo = {
  numero?: string
  cliente?: string
  valido_hasta?: string | null
}

type GiftcardPreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageDataUrl: string | null
  info?: GiftcardPreviewInfo | null
  giftcardId?: string | null
}

export function GiftcardPreviewDialog({
  open,
  onOpenChange,
  imageDataUrl,
  info,
  giftcardId,
}: GiftcardPreviewDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewSrc = imageDataUrl || shareUrl

  useEffect(() => {
    let active = true
    if (!open || !giftcardId) {
      setShareUrl(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setShareUrl(null)
    createShareLink({ tipo: "giftcard", id: giftcardId })
      .then((data) => {
        if (!active) return
        setShareUrl(data.url || null)
      })
      .catch((err) => {
        if (!active) return
        setShareUrl(null)
        setError(err?.message || "No se pudo generar el link.")
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, giftcardId])

  const handleShare = async () => {
    if (!shareUrl) {
      alert(error || "No se pudo generar el link.")
      return
    }
    if (navigator.share) {
      try {
        await navigator.share({
          url: shareUrl,
          title: "Giftcard",
          text: "Giftcard generada",
        })
        return
      } catch (err: any) {
        if (err?.name === "AbortError") return
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl)
      alert("Link copiado.")
    } catch {
      alert("No se pudo copiar el link.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Giftcard generada</DialogTitle>
        </DialogHeader>

        {previewSrc ? (
          <div className="space-y-3">
            <Image
              src={previewSrc}
              alt="Giftcard"
              width={1200}
              height={675}
              unoptimized
              className="w-full rounded-lg border h-auto"
            />
            <div className="text-sm text-muted-foreground">
              {info?.numero && <div>Número: {info.numero}</div>}
              {info?.cliente && <div>Clienta: {info.cliente}</div>}
              {info?.valido_hasta && (
                <div>Válida hasta: {new Date(info.valido_hasta).toLocaleDateString("es-AR")}</div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No hay imagen para mostrar.</p>
        )}

        {loading && <p className="text-xs text-muted-foreground">Generando link...</p>}
        {error && !loading && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end">
          <Button type="button" onClick={handleShare} disabled={loading || !shareUrl} className="gap-2">
            <Share2Icon className="h-4 w-4" />
            Compartir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
