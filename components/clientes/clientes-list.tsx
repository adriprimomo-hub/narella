"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ClienteForm } from "./cliente-form"
import { ClienteHistorialModal } from "./cliente-historial"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PencilIcon, Trash2Icon, PlusIcon, SearchIcon } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())
const CLIENTES_PAGE_SIZE = 60

export interface Cliente {
  id: string
  nombre: string
  apellido: string
  telefono: string
  observaciones: string | null
}

type ClientesPageResponse = {
  items: Cliente[]
  pagination?: {
    page: number
    page_size: number
    has_prev: boolean
    has_next: boolean
  }
}

export function ClientesList() {
  const [page, setPage] = useState(1)
  const { data: clientesResponse, mutate } = useSWR<ClientesPageResponse>(
    `/api/clientes?page=${page}&page_size=${CLIENTES_PAGE_SIZE}`,
    fetcher,
  )
  const { data: config } = useSWR<{ rol?: string }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const clientes = Array.isArray(clientesResponse?.items) ? clientesResponse.items : []
  const pagination = clientesResponse?.pagination || {
    page,
    page_size: CLIENTES_PAGE_SIZE,
    has_prev: page > 1,
    has_next: false,
  }

  const filtered = clientes.filter((c) => `${c.nombre} ${c.apellido}`.toLowerCase().includes(search.toLowerCase()))

  const handleDelete = async (id: string) => {
    if (!isAdmin) return
    if (!confirm("Eliminar cliente?")) return
    await fetch(`/api/clientes/${id}`, { method: "DELETE" })
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Button
          onClick={() => {
            setSelectedCliente(null)
            setShowForm(true)
          }}
          className="gap-2"
          variant="primary"
        >
          <PlusIcon className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      <div className="relative w-full sm:w-80">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0 pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Sin clientas para esta página.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">{`${cliente.nombre} ${cliente.apellido}`}</TableCell>
                    <TableCell>{cliente.telefono}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{cliente.observaciones}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {isAdmin && (
                          <ClienteHistorialModal
                            clienteId={cliente.id}
                            nombreCliente={`${cliente.nombre} ${cliente.apellido}`}
                          />
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedCliente(cliente)
                            setShowForm(true)
                          }}
                          className="gap-1.5"
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(cliente.id)}
                            className="gap-1.5"
                          >
                            <Trash2Icon className="h-3.5 w-3.5" />
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <div className="flex flex-col gap-2 px-6 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Página {pagination.page}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.has_prev}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!pagination.has_next}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) {
            setShowForm(false)
            setSelectedCliente(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedCliente ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para {selectedCliente ? "editar" : "crear"} una clienta.
            </DialogDescription>
          </DialogHeader>
          <ClienteForm
            key={selectedCliente?.id || "new"}
            cliente={selectedCliente}
            onSuccess={() => {
              mutate()
              setPage(1)
              setShowForm(false)
              setSelectedCliente(null)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
