"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { PlusIcon, PencilIcon, Trash2Icon, SearchIcon, ImageIcon } from "lucide-react"
import type { Cliente } from "@/components/clientes/clientes-list"
import type { Servicio } from "@/components/servicios/servicios-list"
import { GiftcardForm, type GiftcardData } from "./giftcard-form"
import { GiftcardPreviewDialog } from "./giftcard-preview-dialog"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { formatDate } from "@/lib/date-format"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

type Config = { metodos_pago_config?: { nombre: string }[]; rol?: string }

type GiftcardRow = GiftcardData & {
  clientes?: { nombre: string; apellido: string } | null
  servicios?: { id: string; nombre: string }[]
  vigente?: boolean
  usada_en?: string | null
  estado?: string | null
}

export function GiftcardsPanel() {
  const { data: giftcards = [], mutate } = useSWR<GiftcardRow[]>("/api/giftcards", fetcher)
  const { data: clientes = [] } = useSWR<Cliente[]>("/api/clientes", fetcher)
  const { data: servicios = [] } = useSWR<Servicio[]>("/api/servicios", fetcher)
  const { data: config } = useSWR<Config>("/api/config", fetcher)
  const { data: branding } = useSWR<{ data_url?: string | null }>("/api/branding/logo", fetcher)

  const metodosPago = useMemo(
    () => (config?.metodos_pago_config?.length ? config.metodos_pago_config.map((m) => m.nombre).filter(Boolean) : ["efectivo", "tarjeta", "transferencia"]),
    [config],
  )

  const [search, setSearch] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [selectedGiftcard, setSelectedGiftcard] = useState<GiftcardRow | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewGiftcard, setPreviewGiftcard] = useState<GiftcardRow | null>(null)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null)
  const [facturaId, setFacturaId] = useState<string | null>(null)

  const serviciosMap = useMemo(() => new Map(servicios.map((s) => [s.id, s])), [servicios])

  const filtered = giftcards.filter((g) => {
    const term = search.toLowerCase()
    const cliente = `${g.clientes?.nombre || ""} ${g.clientes?.apellido || ""}`.toLowerCase()
    const numero = `${g.numero || ""}`.toLowerCase()
    const deParte = `${g.de_parte_de || ""}`.toLowerCase()
    const serviciosLabel = Array.isArray(g.servicios) ? g.servicios.map((s) => s.nombre).join(" ").toLowerCase() : ""
    return cliente.includes(term) || numero.includes(term) || deParte.includes(term) || serviciosLabel.includes(term)
  })

  const getEstadoLabel = (g: GiftcardRow) => {
    if (g.estado === "usada" || g.usada_en) return "Usada"
    if (g.vigente === false) return "Vencida"
    return "Vigente"
  }

  const getEstadoVariant = (g: GiftcardRow) => {
    const label = getEstadoLabel(g)
    if (label === "Usada") return "secondary"
    if (label === "Vencida") return "destructive"
    return "outline"
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar giftcard?")) return
    const res = await fetch(`/api/giftcards/${id}`, { method: "DELETE" })
    if (!res.ok) return
    mutate()
  }

  const handlePreview = (giftcard: GiftcardRow) => {
    setPreviewGiftcard(giftcard)
    setPreviewOpen(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          onClick={() => {
            setSelectedGiftcard(null)
            setShowForm(true)
          }}
          className="gap-2"
          variant="primary"
        >
          <PlusIcon className="h-4 w-4" />
          Nueva giftcard
        </Button>
        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar giftcard..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0 pt-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Clienta</TableHead>
                  <TableHead>Servicios</TableHead>
                  <TableHead>Validez</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-sm text-muted-foreground">
                      Sin giftcards registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((g) => {
                    const serviciosLabel =
                      Array.isArray(g.servicios) && g.servicios.length
                        ? g.servicios.map((s) => s.nombre).join(", ")
                        : Array.isArray(g.servicio_ids)
                          ? g.servicio_ids
                              .map((id) => serviciosMap.get(id)?.nombre)
                              .filter(Boolean)
                              .join(", ")
                          : "-"
                    const clienteLabel = g.clientes
                      ? `${g.clientes.nombre} ${g.clientes.apellido}`.trim()
                      : "Cliente"
                    const puedeEditar = !(g.estado === "usada" || g.usada_en)
                    return (
                      <TableRow key={g.id}>
                        <TableCell className="font-semibold">{g.numero}</TableCell>
                        <TableCell>{clienteLabel}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{serviciosLabel}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {g.valido_hasta ? formatDate(g.valido_hasta) : "-"}
                        </TableCell>
                        <TableCell className="text-right">${Number(g.monto_total || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={getEstadoVariant(g)}>{getEstadoLabel(g)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => handlePreview(g)} className="gap-1.5">
                              <ImageIcon className="h-4 w-4" />
                              Ver
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSelectedGiftcard(g)
                                setShowForm(true)
                              }}
                              className="gap-1.5"
                              disabled={!puedeEditar}
                            >
                              <PencilIcon className="h-4 w-4" />
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDelete(g.id)}
                              className="gap-1.5"
                              disabled={!puedeEditar}
                            >
                              <Trash2Icon className="h-4 w-4" />
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false)
            setSelectedGiftcard(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedGiftcard ? "Editar giftcard" : "Nueva giftcard"}</DialogTitle>
            <DialogDescription className="sr-only">Formulario para crear o editar giftcards.</DialogDescription>
          </DialogHeader>
          <GiftcardForm
            giftcard={selectedGiftcard}
            clientes={clientes}
            servicios={servicios}
            metodosPago={metodosPago}
            logoDataUrl={branding?.data_url || null}
            onSuccess={({ giftcard, imagen_base64, factura, factura_id, factura_pendiente, factura_error }) => {
              mutate()
              setShowForm(false)
              setSelectedGiftcard(null)
              if (factura_pendiente) {
                const detalle = factura_error ? `\nDetalle: ${factura_error}` : ""
                alert(`Giftcard creada. El comprobante quedó pendiente y se reintentará automáticamente.${detalle}`)
              } else if (factura_error) {
                alert(`Giftcard creada. No se pudo facturar: ${factura_error}`)
              }
              if (factura_id && !factura_pendiente) {
                setFacturaInfo(factura || null)
                setFacturaId(factura_id || null)
                setFacturaOpen(true)
              }
              if (imagen_base64) {
                setPreviewGiftcard({ ...(giftcard as GiftcardRow), imagen_base64 })
                setPreviewOpen(true)
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <GiftcardPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageDataUrl={previewGiftcard?.imagen_base64 || null}
        giftcardId={previewGiftcard?.id || null}
        info={
          previewGiftcard
            ? {
                numero: previewGiftcard.numero,
                cliente: previewGiftcard.clientes
                  ? `${previewGiftcard.clientes.nombre} ${previewGiftcard.clientes.apellido}`.trim()
                  : undefined,
                valido_hasta: previewGiftcard.valido_hasta || null,
              }
            : null
        }
      />

      <FacturaDialog
        open={facturaOpen}
        onOpenChange={(open) => {
          setFacturaOpen(open)
          if (!open) setFacturaId(null)
        }}
        facturaId={facturaId}
        factura={facturaInfo}
      />
    </div>
  )
}
