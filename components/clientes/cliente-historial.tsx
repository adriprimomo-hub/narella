"use client"

import { HistorialCliente } from "../reportes/historial-cliente"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { HistoryIcon } from "lucide-react"

interface ClienteHistorialProps {
  clienteId: string
  nombreCliente: string
}

export function ClienteHistorialModal({ clienteId, nombreCliente }: ClienteHistorialProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <HistoryIcon className="h-3.5 w-3.5" />
          Ver historial
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl sm:max-w-6xl max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial - {nombreCliente}</DialogTitle>
           <DialogDescription className="sr-only">Historial completo de turnos y pagos de la clienta seleccionada.</DialogDescription>
        </DialogHeader>
        <HistorialCliente clienteId={clienteId} />
      </DialogContent>
    </Dialog>
  )
}
