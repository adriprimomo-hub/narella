"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { UserBadge } from "../ui/user-badge"
import type { Empleada } from "../empleadas/types"
import { formatDateTime } from "@/lib/date-format"

type Insumo = {
  id: string
  nombre: string
  stock_actual?: number | null
  stock_minimo?: number | null
  activo?: boolean
}

type Movimiento = {
  id: string
  insumo_id: string
  tipo: "compra" | "ajuste_positivo" | "ajuste_negativo" | "entrega"
  cantidad: number
  empleado_id?: string | null
  nota?: string | null
  created_at?: string
  creado_por?: string | null
  creado_por_username?: string | null
  insumos?: { nombre: string }
  empleadas?: { nombre: string; apellido?: string | null }
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export function InsumosPanel() {
  const { data: insumos, mutate } = useSWR<Insumo[]>("/api/insumos", fetcher)
  const { data: movimientos, mutate: mutateMov } = useSWR<Movimiento[]>("/api/insumos/movimientos", fetcher)
  const { data: empleadas } = useSWR<Empleada[]>("/api/empleadas", fetcher)
  const { data: config } = useSWR<{ rol?: string }>("/api/config", fetcher)
  const isAdmin = config?.rol === "admin"

  const insumosList = Array.isArray(insumos) ? insumos : []
  const movimientosList = Array.isArray(movimientos) ? movimientos : []
  const empleadasList = Array.isArray(empleadas) ? empleadas : []

  const [nuevo, setNuevo] = useState({
    nombre: "",
    stock_actual: "" as number | "",
    stock_minimo: "" as number | "",
  })
  const [selectedInsumo, setSelectedInsumo] = useState<Insumo | null>(null)
  const [mov, setMov] = useState({
    insumo_id: "",
    tipo: "compra" as Movimiento["tipo"],
    cantidad: "" as number | "",
    empleado_id: "",
    nota: "",
  })
  const [searchInsumo, setSearchInsumo] = useState("")
  const [searchMov, setSearchMov] = useState("")
  const [searchMovInsumo, setSearchMovInsumo] = useState("")
  const [searchEmpleado, setSearchEmpleado] = useState("")
  const [showNuevo, setShowNuevo] = useState(false)
  const [showMov, setShowMov] = useState(false)
  const [nuevoErrors, setNuevoErrors] = useState<{ nombre?: string }>({})
  const [movErrors, setMovErrors] = useState<{ insumo?: string; cantidad?: string; empleada?: string }>({})

  const handleDeleteInsumo = async (id: string) => {
    if (!isAdmin) return
    if (!confirm("Eliminar insumo?")) return
    const res = await fetch(`/api/insumos/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      alert(data?.error || "No se pudo eliminar el insumo.")
      return
    }
    mutate()
  }

  const resetInsumoForm = () => {
    setNuevo({ nombre: "", stock_actual: "", stock_minimo: "" })
    setNuevoErrors({})
  }

  useEffect(() => {
    if (!selectedInsumo) return
    setNuevo({
      nombre: selectedInsumo.nombre || "",
      stock_actual: selectedInsumo.stock_actual ?? "",
      stock_minimo: selectedInsumo.stock_minimo ?? "",
    })
    setNuevoErrors({})
  }, [selectedInsumo])

  const insumosFiltrados = useMemo(
    () =>
      insumosList.filter((i) => i.nombre.toLowerCase().includes(searchInsumo.toLowerCase())),
    [insumosList, searchInsumo],
  )

  const movimientosFiltrados = useMemo(
    () =>
      movimientosList.filter((m) =>
        `${m.insumos?.nombre || ""} ${m.empleadas?.nombre || ""} ${m.empleadas?.apellido || ""} ${m.nota || ""}`
          .toLowerCase()
          .includes(searchMov.toLowerCase()),
      ),
    [movimientosList, searchMov],
  )

  const insumosParaMovimiento = useMemo(
    () =>
      searchMovInsumo
        ? insumosList.filter((i) => i.nombre.toLowerCase().includes(searchMovInsumo.toLowerCase()))
        : [],
    [insumosList, searchMovInsumo],
  )

  const empleadasFiltradas = useMemo(
    () =>
      searchEmpleado
        ? empleadasList.filter((e) =>
            `${e.nombre} ${e.apellido || ""}`.toLowerCase().includes(searchEmpleado.toLowerCase()),
          )
        : [],
    [empleadasList, searchEmpleado],
  )

  const guardarInsumo = async () => {
    if (!nuevo.nombre.trim()) {
      setNuevoErrors({ nombre: "Ingresa el nombre del insumo." })
      return
    }
    setNuevoErrors({})
    const isEditing = Boolean(selectedInsumo)
    const res = await fetch(isEditing ? `/api/insumos/${selectedInsumo?.id}` : "/api/insumos", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...nuevo,
        stock_actual: Number(nuevo.stock_actual) || 0,
        stock_minimo: Number(nuevo.stock_minimo) || 0,
      }),
    })
    if (!res.ok) return
    resetInsumoForm()
    setSelectedInsumo(null)
    setShowNuevo(false)
    mutate()
  }

  const registrarMovimiento = async () => {
    const nextErrors: { insumo?: string; cantidad?: string; empleada?: string } = {}
    if (!mov.insumo_id) nextErrors.insumo = "Selecciona un insumo."
    if (!mov.cantidad || Number(mov.cantidad) <= 0) nextErrors.cantidad = "Ingresa una cantidad válida."
    if (mov.tipo === "entrega" && !mov.empleado_id) nextErrors.empleada = "Selecciona la empleada."
    if (Object.keys(nextErrors).length > 0) {
      setMovErrors(nextErrors)
      return
    }
    setMovErrors({})

    try {
      const res = await fetch("/api/insumos/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...mov,
          cantidad: Number(mov.cantidad),
          empleado_id: mov.empleado_id || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "No se pudo registrar el movimiento")
      }
    } catch (error) {
      console.error("[insumos] Error al registrar movimiento", error)
      alert(error instanceof Error ? error.message : "Error al registrar el movimiento")
      return
    }

    setMov({ insumo_id: "", tipo: "compra", cantidad: "", empleado_id: "", nota: "" })
    setSearchMovInsumo("")
    setSearchEmpleado("")
    setShowMov(false)
    mutateMov()
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Button
            className="gap-2"
            variant="primary"
            onClick={() => {
              setSelectedInsumo(null)
              resetInsumoForm()
              setShowNuevo(true)
            }}
          >
            <PlusIcon className="h-4 w-4" />
            Nuevo insumo
          </Button>
        </div>

        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar insumo..."
            value={searchInsumo}
            onChange={(e) => setSearchInsumo(e.target.value)}
          />
        </div>

        <Card>
          <CardContent className="p-0 pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Minimo</TableHead>
                    {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                {insumosFiltrados.map((i) => {
                  const bajoStock = (i.stock_actual || 0) <= (i.stock_minimo || 0)
                  return (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">{i.nombre}</TableCell>
                      <TableCell className={bajoStock ? "text-destructive font-semibold text-right" : "text-right"}>
                        {i.stock_actual ?? 0}
                      </TableCell>
                      <TableCell className="text-right">{i.stock_minimo ?? 0}</TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSelectedInsumo(i)
                                setShowNuevo(true)
                              }}
                              className="gap-1.5"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDeleteInsumo(i.id)}
                              className="gap-1.5"
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={showNuevo}
        onOpenChange={(open) => {
          if (!open) {
            setShowNuevo(false)
            setSelectedInsumo(null)
            resetInsumoForm()
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedInsumo ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para {selectedInsumo ? "editar" : "crear"} un insumo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Nombre del insumo</p>
              <Input
                value={nuevo.nombre}
                onChange={(e) => {
                  setNuevo({ ...nuevo, nombre: e.target.value })
                  if (nuevoErrors.nombre) setNuevoErrors({})
                }}
              />
              {nuevoErrors.nombre && <p className="text-xs text-destructive">{nuevoErrors.nombre}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Stock actual</p>
                <Input
                  type="number"
                  value={nuevo.stock_actual}
                  onChange={(e) =>
                    setNuevo({ ...nuevo, stock_actual: e.target.value === "" ? "" : Number.parseFloat(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Stock minimo</p>
                <Input
                  type="number"
                  value={nuevo.stock_minimo}
                  onChange={(e) =>
                    setNuevo({ ...nuevo, stock_minimo: e.target.value === "" ? "" : Number.parseFloat(e.target.value) })
                  }
                />
              </div>
            </div>
            <Button className="w-full gap-2" variant="primary" onClick={guardarInsumo}>
              <PlusIcon className="h-4 w-4" />
              {selectedInsumo ? "Actualizar insumo" : "Crear insumo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Button className="gap-2" variant="primary" onClick={() => setShowMov(true)}>
            <PlusIcon className="h-4 w-4" />
            Nuevo movimiento
          </Button>
        </div>

        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar movimiento..."
            value={searchMov}
            onChange={(e) => setSearchMov(e.target.value)}
          />
        </div>

        <Card>
          <CardContent className="p-0 pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Insumo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead>Empleada</TableHead>
                    <TableHead>Por</TableHead>
                    <TableHead>Nota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientosFiltrados.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">
                        {m.created_at ? formatDateTime(m.created_at) : "-"}
                      </TableCell>
                      <TableCell>{m.insumos?.nombre || "-"}</TableCell>
                      <TableCell className="capitalize text-xs">{m.tipo.replace("_", " ")}</TableCell>
                      <TableCell className="text-right">{m.cantidad}</TableCell>
                      <TableCell>
                        {m.empleadas
                          ? `${m.empleadas.nombre} ${m.empleadas.apellido || ""}`.trim()
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <UserBadge username={m.creado_por_username} userId={m.creado_por} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.nota || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showMov} onOpenChange={(open) => !open && setShowMov(false)}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo movimiento</DialogTitle>
            <DialogDescription className="sr-only">Registrar un movimiento de insumo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Insumo</p>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={searchMovInsumo}
                  onChange={(e) => setSearchMovInsumo(e.target.value)}
                />
              </div>
              {movErrors.insumo && <p className="text-xs text-destructive">{movErrors.insumo}</p>}
              {searchMovInsumo && (
                <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                  {insumosParaMovimiento.length ? (
                    insumosParaMovimiento.map((i) => (
                      <Button
                        key={i.id}
                        type="button"
                        variant={mov.insumo_id === i.id ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          setMov((p) => ({ ...p, insumo_id: i.id }))
                          if (movErrors.insumo) {
                            setMovErrors((prev) => ({ ...prev, insumo: undefined }))
                          }
                        }}
                      >
                        {i.nombre}
                      </Button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Tipo de movimiento</p>
              <Select value={mov.tipo} onValueChange={(value) => setMov({ ...mov, tipo: value as Movimiento["tipo"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona tipo de movimiento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compra">Compra</SelectItem>
                  <SelectItem value="ajuste_positivo">Ajuste positivo</SelectItem>
                  <SelectItem value="ajuste_negativo">Ajuste negativo</SelectItem>
                  <SelectItem value="entrega">Entrega / consumo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">Cantidad</p>
              <Input
                type="number"
                min={0}
                value={mov.cantidad}
                onChange={(e) => {
                  setMov({ ...mov, cantidad: e.target.value === "" ? "" : Number.parseFloat(e.target.value) })
                  if (movErrors.cantidad) {
                    setMovErrors((prev) => ({ ...prev, cantidad: undefined }))
                  }
                }}
              />
              {movErrors.cantidad && <p className="text-xs text-destructive">{movErrors.cantidad}</p>}
            </div>

            {mov.tipo === "entrega" && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Empleada</p>
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar empleada..."
                  value={searchEmpleado}
                  onChange={(e) => setSearchEmpleado(e.target.value)}
                />
              </div>
              {movErrors.empleada && <p className="text-xs text-destructive">{movErrors.empleada}</p>}
              {searchEmpleado && (
                <div className="space-y-1 rounded-md border bg-muted/40 p-2">
                  {empleadasFiltradas.length ? (
                    empleadasFiltradas.map((e) => (
                      <Button
                        key={e.id}
                        type="button"
                        variant={mov.empleado_id === e.id ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          setMov((p) => ({ ...p, empleado_id: e.id }))
                          if (movErrors.empleada) {
                            setMovErrors((prev) => ({ ...prev, empleada: undefined }))
                          }
                        }}
                      >
                        {e.nombre}
                        {e.apellido ? ` ${e.apellido}` : ""}
                      </Button>
                    ))
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin resultados.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-sm font-medium">Nota (opcional)</p>
              <Input
                value={mov.nota}
                onChange={(e) => setMov({ ...mov, nota: e.target.value })}
              />
            </div>

            <Button className="w-full gap-2" variant="primary" onClick={registrarMovimiento}>
              <PlusIcon className="h-4 w-4" />
              Registrar movimiento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

