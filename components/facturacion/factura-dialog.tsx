"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Share2Icon } from "lucide-react"
import { createShareLink } from "@/lib/share-links-client"

export type FacturaInfo = {
  numero?: number
  punto_venta?: number
  cbte_tipo?: number
  cae?: string
  cae_vto?: string
  total?: number
}

type FacturaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  factura?: FacturaInfo | null
  facturaId?: string | null
}

export function FacturaDialog({ open, onOpenChange, factura, facturaId }: FacturaDialogProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [isAppleMobile, setIsAppleMobile] = useState(false)

  useEffect(() => {
    if (typeof navigator === "undefined") return
    const ua = navigator.userAgent || ""
    setIsAppleMobile(/iPhone|iPad|iPod/i.test(ua))
  }, [])

  useEffect(() => {
    let active = true
    if (!open || !facturaId) {
      setShareUrl(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    setShareUrl(null)
    setPreviewFailed(false)
    createShareLink({ tipo: "factura", id: facturaId })
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
  }, [open, facturaId])

  const handleOpen = () => {
    if (!shareUrl) return
    const opened = window.open(shareUrl, "_blank", "noopener,noreferrer")
    if (!opened) {
      window.location.href = shareUrl
    }
  }

  const handleShare = async () => {
    if (!shareUrl) {
      alert(error || "No se pudo generar el link.")
      return
    }
    if (navigator.share) {
      try {
        await navigator.share({
          url: shareUrl,
          title: "Factura",
          text: "Factura emitida",
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

  const comprobante =
    factura?.punto_venta != null && factura?.numero != null
      ? `${String(Number(factura.punto_venta) || 0).padStart(5, "0")}-${String(Number(factura.numero) || 0).padStart(8, "0")}`
      : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Ver comprobante</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {comprobante && <div>Comprobante: {comprobante}</div>}
          {factura?.cae && <div>CAE: {factura.cae}</div>}
          {factura?.cae_vto && <div>Vto CAE: {factura.cae_vto}</div>}
          {factura?.total != null && <div>Total: ${Number(factura.total).toFixed(2)}</div>}
        </div>

        {loading && <p className="text-sm text-muted-foreground">Cargando vista previa...</p>}
        {error && !loading && <p className="text-sm text-destructive">{error}</p>}
        {!loading && !error && shareUrl && !isAppleMobile && !previewFailed && (
          <div className="rounded-md border overflow-hidden bg-white">
            <iframe
              src={shareUrl}
              title="Vista previa de factura"
              className="h-[68vh] w-full"
              onError={() => setPreviewFailed(true)}
            />
          </div>
        )}
        {!loading && !error && shareUrl && (isAppleMobile || previewFailed) && (
          <div className="space-y-3 rounded-md border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">No se pudo obtener la vista previa.</p>
            <Button type="button" variant="outline" onClick={handleOpen}>
              Abrir en nueva ventana
            </Button>
          </div>
        )}
        {!loading && !error && !shareUrl && <p className="text-sm text-muted-foreground">No se pudo cargar la vista previa.</p>}

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
