"use client"

import { Loader2Icon } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type FacturandoDialogProps = {
  open: boolean
}

export function FacturandoDialog({ open }: FacturandoDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Facturando...</DialogTitle>
          <DialogDescription>Estamos emitiendo el comprobante en ARCA.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center py-3">
          <Loader2Icon className="h-6 w-6 animate-spin text-primary" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
