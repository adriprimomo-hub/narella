"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Loader2Icon, SaveIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Empleada } from "@/components/empleadas/types"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((res) => res.json())

interface Usuario {
  id: string
  username?: string
  rol?: string
  metodos_pago?: string[]
  metodos_pago_config?: MetodoPagoConfig[]
  horario_local?: HorarioLocal[]
}

type AdminUser = {
  id: string
  username?: string
  rol?: string
  empleada_id?: string | null
  created_at?: string | null
  updated_at?: string | null
}

type MetodoPagoConfig = {
  nombre: string
  activo?: boolean
}

type MetodoPagoDraft = MetodoPagoConfig

type HorarioLocal = {
  dia: number
  desde: string
  hasta: string
  activo: boolean
}

const metodosBase: MetodoPagoConfig[] = ["efectivo", "tarjeta", "transferencia"].map((nombre) => ({
  nombre,
  activo: true,
}))

const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const defaultHorarioLocal: HorarioLocal[] = diasSemana.map((_, idx) => ({
  dia: idx,
  desde: idx === 0 ? "" : "09:00",
  hasta: idx === 0 ? "" : "20:00",
  activo: idx !== 0,
}))

const normalizeHorarioPayload = (items: HorarioLocal[]) =>
  items.map((h) => ({
    ...h,
    activo: Boolean(h.activo && h.desde && h.hasta),
  }))

const formatHorario = (item: HorarioLocal) =>
  item.activo && item.desde && item.hasta ? `${item.desde} - ${item.hasta}` : "Cerrado"

const roleLabel = (rol?: string) => {
  if (rol === "admin") return "Administrador"
  if (rol === "staff") return "Staff"
  return "Recepción"
}

export function ConfigForm() {
  const { data: config, mutate } = useSWR<Usuario>("/api/config", fetcher)
  const [metodosPago, setMetodosPago] = useState<MetodoPagoConfig[]>(metodosBase)
  const [nuevoMetodo, setNuevoMetodo] = useState<MetodoPagoDraft>({ nombre: "", activo: true })
  const [nuevoUsuarioUsername, setNuevoUsuarioUsername] = useState("")
  const [nuevoUsuarioPassword, setNuevoUsuarioPassword] = useState("")
  const [nuevoUsuarioRol, setNuevoUsuarioRol] = useState<"admin" | "recepcion" | "staff">("recepcion")
  const [nuevoUsuarioEmpleadaId, setNuevoUsuarioEmpleadaId] = useState<string>("")
  const [configMessage, setConfigMessage] = useState("")
  const [userMessage, setUserMessage] = useState("")
  const [metodoErrors, setMetodoErrors] = useState<{ nombre?: string }>({})
  const [userFieldErrors, setUserFieldErrors] = useState<{ username?: string; password?: string; empleada?: string }>({})
  const [userEditErrors, setUserEditErrors] = useState<Record<string, { empleada?: string }>>({})
  const [configLoading, setConfigLoading] = useState(false)
  const [userLoading, setUserLoading] = useState(false)
  const [horarioLocal, setHorarioLocal] = useState<HorarioLocal[]>(defaultHorarioLocal)
  const [horarioDraft, setHorarioDraft] = useState<HorarioLocal[]>(defaultHorarioLocal)
  const [horarioErrors, setHorarioErrors] = useState<Record<number, string>>({})
  const [metodosDraft, setMetodosDraft] = useState<MetodoPagoDraft[]>(metodosBase)
  const [showHorarioDialog, setShowHorarioDialog] = useState(false)
  const [showMetodosDialog, setShowMetodosDialog] = useState(false)
  const [showUsuariosDialog, setShowUsuariosDialog] = useState(false)
  const { data: adminUsers, mutate: mutateUsers } = useSWR<{ users: AdminUser[] }>(
    config?.rol === "admin" ? "/api/admin/users" : null,
    fetcher,
  )
  const { data: empleadas } = useSWR<Empleada[]>(config?.rol === "admin" ? "/api/empleadas" : null, fetcher)
  const [userEdits, setUserEdits] = useState<Record<string, { rol: string; password: string; empleada_id?: string | null }>>({})

  const empleadasList = Array.isArray(empleadas) ? empleadas : []

  useEffect(() => {
    if (config) {
      const detalle =
        config.metodos_pago_config && config.metodos_pago_config.length > 0 ? config.metodos_pago_config : metodosBase
      setMetodosPago(detalle)
      const horarioConfig = Array.isArray(config.horario_local) ? config.horario_local : []
      const normalizado = defaultHorarioLocal.map((base) => {
        const match = horarioConfig.find((h) => h.dia === base.dia)
        if (!match) return base
        const activo = match.activo ?? Boolean(match.desde && match.hasta)
        return { ...base, ...match, activo }
      })
      setHorarioLocal(normalizado)
    }
  }, [config])

  const validateHorarioDraft = (items: HorarioLocal[]) => {
    const nextErrors: Record<number, string> = {}
    items.forEach((h) => {
      if (!h.activo) return
      if (!h.desde || !h.hasta) {
        nextErrors[h.dia] = "Completa desde y hasta."
        return
      }
      if (h.hasta <= h.desde) {
        nextErrors[h.dia] = "La hora hasta debe ser mayor a la hora desde."
      }
    })
    return nextErrors
  }

  const clearHorarioError = (dia: number) => {
    setHorarioErrors((prev) => {
      if (!prev[dia]) return prev
      const next = { ...prev }
      delete next[dia]
      return next
    })
  }

  const handleHorarioDialogChange = (open: boolean) => {
    setShowHorarioDialog(open)
    if (open) {
      setConfigMessage("")
      setHorarioDraft(horarioLocal.map((item) => ({ ...item })))
      setHorarioErrors({})
    }
  }

  const handleMetodosDialogChange = (open: boolean) => {
    setShowMetodosDialog(open)
    if (open) {
      setConfigMessage("")
      setNuevoMetodo({ nombre: "", activo: true })
      setMetodoErrors({})
      setMetodosDraft(metodosPago.map((item) => ({ ...item })))
    }
  }

  const handleUsuariosDialogChange = (open: boolean) => {
    setShowUsuariosDialog(open)
    if (!open) {
      setUserMessage("")
      setUserEdits({})
      setUserFieldErrors({})
      setUserEditErrors({})
    }
  }

  const saveConfig = async (nextMetodos: MetodoPagoDraft[], nextHorario: HorarioLocal[]) => {
    setConfigLoading(true)
    setConfigMessage("")
    const horarioPayload = normalizeHorarioPayload(nextHorario)
    const metodosPayload: MetodoPagoConfig[] = nextMetodos
      .map((m) => ({ nombre: String(m.nombre || "").trim(), activo: m.activo ?? true }))
      .filter((m) => Boolean(m.nombre))
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          metodos_pago_config: metodosPayload,
          horario_local: horarioPayload,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        mutate(data, false)
        setMetodosPago(metodosPayload)
        setHorarioLocal(horarioPayload)
        setConfigMessage("Configuración guardada.")
        setTimeout(() => setConfigMessage(""), 3000)
        return true
      }
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setConfigLoading(false)
    }
    setConfigMessage("Error al guardar.")
    return false
  }

  const handleCreateUser = async () => {
    const nextErrors: { username?: string; password?: string; empleada?: string } = {}
    if (!nuevoUsuarioUsername.trim()) nextErrors.username = "Ingresa el usuario."
    if (!nuevoUsuarioPassword.trim()) nextErrors.password = "Ingresa la contraseña."
    if (nuevoUsuarioRol === "staff" && !nuevoUsuarioEmpleadaId) {
      nextErrors.empleada = "Selecciona una empleada."
    }
    if (Object.keys(nextErrors).length > 0) {
      setUserFieldErrors(nextErrors)
      return
    }
    setUserMessage("")
    setUserFieldErrors({})
    setUserLoading(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nuevoUsuarioUsername,
          password: nuevoUsuarioPassword,
          rol: nuevoUsuarioRol,
          empleada_id: nuevoUsuarioRol === "staff" ? nuevoUsuarioEmpleadaId : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUserMessage(data?.error || "No se pudo crear el usuario")
      } else {
        setUserMessage("Usuario creado.")
        setNuevoUsuarioUsername("")
        setNuevoUsuarioPassword("")
        setNuevoUsuarioEmpleadaId("")
        mutateUsers()
      }
    } catch (err) {
      setUserMessage("Error de red")
    } finally {
      setUserLoading(false)
    }
  }

  const handleUpdateUser = async (id: string) => {
    const edit = userEdits[id]
    if (!edit) return
    if (edit.rol === "staff" && !edit.empleada_id) {
      setUserEditErrors((prev) => ({ ...prev, [id]: { empleada: "Selecciona una empleada." } }))
      return
    }
    setUserMessage("")
    setUserEditErrors((prev) => ({ ...prev, [id]: {} }))
    setUserLoading(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          rol: edit.rol,
          password: edit.password || undefined,
          empleada_id: edit.rol === "staff" ? edit.empleada_id || null : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUserMessage(data?.error || "No se pudo actualizar el usuario")
      } else {
        setUserMessage("Usuario actualizado.")
        setUserEdits((prev) => ({ ...prev, [id]: { ...prev[id], password: "" } }))
        mutateUsers()
      }
    } catch (err) {
      setUserMessage("Error de red")
    } finally {
      setUserLoading(false)
    }
  }

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Eliminar usuario?")) return
    setUserMessage("")
    setUserLoading(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setUserMessage(data?.error || "No se pudo eliminar el usuario")
      } else {
        setUserMessage("Usuario eliminado.")
        mutateUsers()
      }
    } catch (err) {
      setUserMessage("Error de red")
    } finally {
      setUserLoading(false)
    }
  }

  const getEmpleadaNombre = (empleadaId?: string | null) => {
    if (!empleadaId) return ""
    const found = empleadasList.find((empleada) => empleada.id === empleadaId)
    if (!found) return ""
    return `${found.nombre}${found.apellido ? ` ${found.apellido}` : ""}`
  }

  if (config && config.rol !== "admin") {
    return <div className="text-sm text-muted-foreground">Sin acceso.</div>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Horario del local</h3>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => handleHorarioDialogChange(true)}>
            Editar horario
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {horarioLocal.map((h) => (
                <div key={h.dia} className="rounded-lg border p-3 space-y-1">
                  <span className="font-medium">{diasSemana[h.dia]}</span>
                  <p className="text-sm text-muted-foreground">{formatHorario(h)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Métodos de pago</h3>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => handleMetodosDialogChange(true)}>
            Editar métodos
          </Button>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-2">
            {metodosPago.map((metodo) => (
              <div key={metodo.nombre} className="flex items-center justify-between gap-3 rounded-lg border p-4 bg-card">
                <div className="font-medium capitalize">{metodo.nombre}</div>
                {(metodo.activo ?? true) ? (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Activo</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactivo</span>
                )}
              </div>
            ))}
            {metodosPago.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Aún no hay métodos configurados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Cuenta</h3>
        </div>
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <p className="text-sm font-medium">Usuario</p>
              <p className="text-sm text-muted-foreground bg-muted p-2 rounded">{config?.username || "-"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {config?.rol === "admin" && (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Usuarios (admin)</h3>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => handleUsuariosDialogChange(true)}>
              Administrar usuarios
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-3">
              {(adminUsers?.users || []).map((user) => (
                <div key={user.id} className="rounded-lg border p-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">{user.username || "-"}</div>
                    <div className="text-xs text-muted-foreground">{roleLabel(user.rol)}</div>
                  </div>
                  {user.rol === "staff" && user.empleada_id && (
                    <div className="text-xs text-muted-foreground">Staff: {getEmpleadaNombre(user.empleada_id) || "Sin asignar"}</div>
                  )}
                </div>
              ))}
              {adminUsers?.users?.length === 0 && <p className="text-sm text-muted-foreground">No hay usuarios.</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={showHorarioDialog} onOpenChange={handleHorarioDialogChange}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar horario del local</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            {horarioDraft.map((h) => (
              <div key={h.dia} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{diasSemana[h.dia]}</span>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={h.activo}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setHorarioDraft((prev) =>
                          prev.map((item) => (item.dia === h.dia ? { ...item, activo: checked } : item)),
                        )
                        if (!checked) clearHorarioError(h.dia)
                      }}
                      className="rounded border-border"
                    />
                    Abierto
                  </label>
                </div>
                <div className="grid grid-cols-[1fr_1fr] gap-2">
                  <Input
                    type="time"
                    value={h.desde}
                    disabled={!h.activo}
                    onChange={(e) => {
                      setHorarioDraft((prev) =>
                        prev.map((item) => (item.dia === h.dia ? { ...item, desde: e.target.value } : item)),
                      )
                      clearHorarioError(h.dia)
                    }}
                  />
                  <Input
                    type="time"
                    value={h.hasta}
                    disabled={!h.activo}
                    onChange={(e) => {
                      setHorarioDraft((prev) =>
                        prev.map((item) => (item.dia === h.dia ? { ...item, hasta: e.target.value } : item)),
                      )
                      clearHorarioError(h.dia)
                    }}
                  />
                </div>
                {horarioErrors[h.dia] && <p className="text-xs text-destructive">{horarioErrors[h.dia]}</p>}
              </div>
            ))}
          </div>
          {configMessage && <p className="text-sm text-muted-foreground">{configMessage}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => handleHorarioDialogChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                const nextErrors = validateHorarioDraft(horarioDraft)
                if (Object.keys(nextErrors).length > 0) {
                  setHorarioErrors(nextErrors)
                  return
                }
                setHorarioErrors({})
                const ok = await saveConfig(metodosPago, horarioDraft)
                if (ok) handleHorarioDialogChange(false)
              }}
              disabled={configLoading}
              className="gap-2"
            >
              {configLoading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  Guardar cambios
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMetodosDialog} onOpenChange={handleMetodosDialogChange}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar métodos de pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/20 space-y-3">
              <p className="text-sm font-medium">Agregar nuevo método</p>
              <div className="grid gap-3 sm:grid-cols-[2fr_auto]">
                <div>
                  <Input
                    placeholder="Nombre (ej: efectivo)"
                    value={nuevoMetodo.nombre}
                    onChange={(e) => {
                      setNuevoMetodo((p) => ({ ...p, nombre: e.target.value }))
                      if (metodoErrors.nombre) setMetodoErrors((prev) => ({ ...prev, nombre: undefined }))
                    }}
                  />
                  {metodoErrors.nombre && <p className="text-xs text-destructive mt-1">{metodoErrors.nombre}</p>}
                </div>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const nextErrors: { nombre?: string } = {}
                    if (!nuevoMetodo.nombre.trim()) nextErrors.nombre = "Ingresa el nombre."
                    if (Object.keys(nextErrors).length > 0) {
                      setMetodoErrors(nextErrors)
                      return
                    }
                    const metodoNombre = nuevoMetodo.nombre.trim()
                    setMetodosDraft((prev) => [
                      ...prev.filter((m) => m.nombre.toLowerCase() !== metodoNombre.toLowerCase()),
                      { nombre: metodoNombre, activo: true },
                    ])
                    setNuevoMetodo({ nombre: "", activo: true })
                    setMetodoErrors({})
                  }}
                  className="whitespace-nowrap"
                >
                  Agregar
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Métodos configurados</p>
              {metodosDraft.map((metodo) => (
                <div key={metodo.nombre} className="flex items-center justify-between gap-3 rounded-lg border p-4 bg-card">
                  <div className="flex-1">
                    <span className="font-medium capitalize">{metodo.nombre}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setNuevoMetodo(metodo)
                        setMetodosDraft((prev) => prev.filter((m) => m.nombre !== metodo.nombre))
                      }}
                      disabled={metodo.nombre.toLowerCase() === "efectivo"}
                    >
                      Editar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (confirm(`¿Eliminar método "${metodo.nombre}"?`)) {
                          setMetodosDraft((prev) => prev.filter((m) => m.nombre !== metodo.nombre))
                        }
                      }}
                      disabled={metodo.nombre.toLowerCase() === "efectivo"}
                    >
                      Eliminar
                    </Button>
                  </div>
                </div>
              ))}
              {metodosDraft.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">Aún no hay métodos configurados</p>
              )}
            </div>
          </div>
          {configMessage && <p className="text-sm text-muted-foreground">{configMessage}</p>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => handleMetodosDialogChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                const ok = await saveConfig(metodosDraft, horarioLocal)
                if (ok) handleMetodosDialogChange(false)
              }}
              disabled={configLoading}
              className="gap-2"
            >
              {configLoading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <SaveIcon className="h-4 w-4" />
                  Guardar cambios
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {config?.rol === "admin" && (
        <Dialog open={showUsuariosDialog} onOpenChange={handleUsuariosDialogChange}>
        <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Administrar usuarios</DialogTitle>
          </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr]">
                <div>
                  <Input
                    type="text"
                    placeholder="nombre_usuario"
                    value={nuevoUsuarioUsername}
                    onChange={(e) => {
                      setNuevoUsuarioUsername(e.target.value)
                      if (userFieldErrors.username) setUserFieldErrors((prev) => ({ ...prev, username: undefined }))
                    }}
                  />
                  {userFieldErrors.username && <p className="text-xs text-destructive mt-1">{userFieldErrors.username}</p>}
                </div>
                <div>
                  <Input
                    type="password"
                    placeholder="Contraseña"
                    value={nuevoUsuarioPassword}
                    onChange={(e) => {
                      setNuevoUsuarioPassword(e.target.value)
                      if (userFieldErrors.password) setUserFieldErrors((prev) => ({ ...prev, password: undefined }))
                    }}
                  />
                  {userFieldErrors.password && <p className="text-xs text-destructive mt-1">{userFieldErrors.password}</p>}
                </div>
                <Select
                  value={nuevoUsuarioRol}
                  onValueChange={(v) => {
                    const nextRole = v as "admin" | "recepcion" | "staff"
                    setNuevoUsuarioRol(nextRole)
                    if (nextRole !== "staff") {
                      setNuevoUsuarioEmpleadaId("")
                    }
                    if (userFieldErrors.empleada) {
                      setUserFieldErrors((prev) => ({ ...prev, empleada: undefined }))
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="recepcion">Recepción</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={nuevoUsuarioEmpleadaId}
                  onValueChange={(v) => {
                    setNuevoUsuarioEmpleadaId(v)
                    if (userFieldErrors.empleada) {
                      setUserFieldErrors((prev) => ({ ...prev, empleada: undefined }))
                    }
                  }}
                  disabled={nuevoUsuarioRol !== "staff"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Asignar staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {empleadasList.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nombre} {e.apellido ? ` ${e.apellido}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {userFieldErrors.empleada && <p className="text-xs text-destructive md:col-span-4">{userFieldErrors.empleada}</p>}
              </div>
              <Button
                type="button"
                variant="primary"
                onClick={handleCreateUser}
                disabled={userLoading}
              >
                Crear usuario
              </Button>
              {userMessage && <p className="text-sm text-muted-foreground">{userMessage}</p>}

              <div className="space-y-3 pt-2">
                {(adminUsers?.users || []).map((user) => {
                  const current = userEdits[user.id] || {
                    rol: user.rol || "recepcion",
                    password: "",
                    empleada_id: user.empleada_id || "",
                  }
                  return (
                    <div key={user.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm font-medium">{user.username || "-"}</div>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                          <Select
                            value={current.rol}
                            onValueChange={(v) => {
                              setUserEdits((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...current,
                                  rol: v as string,
                                  empleada_id: v === "staff" ? current.empleada_id : "",
                                },
                              }))
                              if (v !== "staff" && userEditErrors[user.id]?.empleada) {
                                setUserEditErrors((prev) => ({ ...prev, [user.id]: { empleada: undefined } }))
                              }
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="recepcion">Recepción</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={current.empleada_id || ""}
                            onValueChange={(v) => {
                              setUserEdits((prev) => ({
                                ...prev,
                                [user.id]: { ...current, empleada_id: v },
                              }))
                              if (userEditErrors[user.id]?.empleada) {
                                setUserEditErrors((prev) => ({ ...prev, [user.id]: { empleada: undefined } }))
                              }
                            }}
                            disabled={current.rol !== "staff"}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue placeholder="Asignar staff" />
                            </SelectTrigger>
                            <SelectContent>
                              {empleadasList.map((e) => (
                                <SelectItem key={e.id} value={e.id}>
                                  {e.nombre} {e.apellido ? ` ${e.apellido}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {userEditErrors[user.id]?.empleada && (
                            <p className="text-xs text-destructive">{userEditErrors[user.id]?.empleada}</p>
                          )}
                          <Input
                            type="password"
                            placeholder="Nueva contraseña"
                            value={current.password}
                            onChange={(e) =>
                              setUserEdits((prev) => ({
                                ...prev,
                                [user.id]: { ...current, password: e.target.value },
                              }))
                            }
                            className="md:w-48"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => handleUpdateUser(user.id)}
                              disabled={userLoading}
                            >
                              Actualizar
                            </Button>
                            <Button
                              type="button"
                              variant="danger"
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={userLoading}
                            >
                              Eliminar
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                {adminUsers?.users?.length === 0 && <p className="text-sm text-muted-foreground">No hay usuarios.</p>}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
