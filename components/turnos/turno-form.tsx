import type React from "react"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FacturaDialog, type FacturaInfo } from "@/components/facturacion/factura-dialog"
import { FacturandoDialog } from "@/components/facturacion/facturando-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Cliente } from "../clientes/clientes-list"
import type { Servicio } from "../servicios/servicios-list"
import type { Turno } from "./turnos-grid"
import type { Empleada } from "../empleadas/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { AlertTriangleIcon, CalendarPlusIcon, Loader2Icon, PlusIcon, SaveIcon, SearchIcon, Trash2Icon, XIcon } from "lucide-react"

type Sena = {
  id: string
  monto: number
  estado: string
  nota?: string | null
  servicio_id: string
  servicios?: { id: string; nombre: string } | null
}

type Giftcard = {
  id: string
  numero: string
  servicio_ids: string[]
  servicios?: { id: string; nombre: string }[]
  valido_hasta?: string | null
  de_parte_de?: string | null
  estado?: string | null
}

type Config = { metodos_pago_config?: { nombre: string }[] }

type SimultaneoItem = {
  id: string
  servicio_id: string
  empleada_id: string
  duracion_minutos: number | ""
  observaciones?: string | null
}

type RecursoConflicto = {
  recurso_id: string
  recurso_nombre: string
  cantidad_disponible: number
  max_simultaneos: number
}

const formatForInput = (dateString: string) => {
  if (!dateString) return ""
  const date = new Date(dateString)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60000)
  return local.toISOString().slice(0, 16)
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface TurnoFormProps {
  clientes: Cliente[]
  servicios: Servicio[]
  empleadas: Empleada[]
  onSuccess: () => void
  onCancel?: () => void
  turno?: Turno | null
  initialFecha?: string | null
  initialEmpleadaId?: string | null
  onMetaChange?: (meta: { fecha_inicio?: string; empleada_id?: string; servicio_id?: string }) => void
}

export function TurnoForm({
  clientes,
  servicios,
  empleadas,
  onSuccess,
  onCancel,
  turno,
  initialFecha,
  initialEmpleadaId,
  onMetaChange,
}: TurnoFormProps) {
  const createSimultaneoId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID()
    }
    return `sim-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
  const [formData, setFormData] = useState({
    cliente_id: turno?.cliente_id || "",
    servicio_id: turno?.servicio_id || "",
    fecha_inicio: turno ? formatForInput(turno.fecha_inicio) : initialFecha ? formatForInput(initialFecha) : "",
    duracion_minutos: turno?.duracion_minutos ?? "",
    observaciones: turno?.observaciones || "",
    empleada_id: turno?.empleada_id || initialEmpleadaId || "",
  })
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    cliente?: string
    servicio?: string
    empleada?: string
    fecha_inicio?: string
    duracion_minutos?: string
  }>({})
  const [simultaneoErrors, setSimultaneoErrors] = useState<
    Record<string, { servicio?: string; empleada?: string; duracion?: string }>
  >({})
  const [recursosConflicto, setRecursosConflicto] = useState<RecursoConflicto[]>([])
  const [showRecursosDialog, setShowRecursosDialog] = useState(false)
  const [clienteQuery, setClienteQuery] = useState("")
  const [servicioQuery, setServicioQuery] = useState("")
  const [empleadaQuery, setEmpleadaQuery] = useState("")
  const [servicioListOpen, setServicioListOpen] = useState(false)
  const [duracionEditadaManualmente, setDuracionEditadaManualmente] = useState(false)
  const [showSenasClienteDialog, setShowSenasClienteDialog] = useState(false)
  const [buscandoBeneficiosCliente, setBuscandoBeneficiosCliente] = useState(false)
  const [showSenaForm, setShowSenaForm] = useState(false)
  const [guardandoSena, setGuardandoSena] = useState(false)
  const [senaErrorMessage, setSenaErrorMessage] = useState<string | null>(null)
  const [senaErrors, setSenaErrors] = useState<{ servicio?: string; monto?: string }>({})
  const [senaForm, setSenaForm] = useState<{
    monto: number | "";
    metodo_pago: string;
    nota: string;
    servicio_id: string;
  }>({
    monto: "",
    metodo_pago: "efectivo",
    nota: "",
    servicio_id: "",
  })
  const [facturarSena, setFacturarSena] = useState(false)
  const [facturarIncremento, setFacturarIncremento] = useState(false)
  const [facturaOpen, setFacturaOpen] = useState(false)
  const [facturaInfo, setFacturaInfo] = useState<FacturaInfo | null>(null)
  const [facturaId, setFacturaId] = useState<string | null>(null)
  const [facturando, setFacturando] = useState(false)
  const [senasParaDialog, setSenasParaDialog] = useState<Sena[]>([])
  const [giftcardsParaDialog, setGiftcardsParaDialog] = useState<Giftcard[]>([])
  const [senaExistente, setSenaExistente] = useState<Sena | null>(null)
  const [showIncrementarForm, setShowIncrementarForm] = useState(false)
  const [incrementoMonto, setIncrementoMonto] = useState<number | "">("")
  const [incrementoMetodo, setIncrementoMetodo] = useState("efectivo")
  const [guardandoIncremento, setGuardandoIncremento] = useState(false)
  const [incrementoErrors, setIncrementoErrors] = useState<{ monto?: string }>({})
  const [simultaneoServicioQuery, setSimultaneoServicioQuery] = useState<Record<string, string>>({})
  const [simultaneoStaffQuery, setSimultaneoStaffQuery] = useState<Record<string, string>>({})
  const [showCrearClienteDialog, setShowCrearClienteDialog] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", apellido: "", telefono: "" })
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const [clienteError, setClienteError] = useState<string | null>(null)
  const [clienteFormErrors, setClienteFormErrors] = useState<{ nombre?: string }>({})
  const [simultaneos, setSimultaneos] = useState<SimultaneoItem[]>([])
  const servicioBlurRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const servicioContainerRef = useRef<HTMLDivElement | null>(null)
  const prevEmpleadaIdRef = useRef<string | null>(null)

  const serviciosPrincipales = useMemo(
    () => servicios.filter((s: any) => (s as any).tipo !== "adicional"),
    [servicios],
  )
  const isServicioHabilitado = (servicioId: string, empleadaId: string) => {
    if (!servicioId) return true
    const servicio = serviciosPrincipales.find((s) => s.id === servicioId)
    if (!servicio) return true
    const habilitadas = Array.isArray((servicio as any).empleadas_habilitadas) ? (servicio as any).empleadas_habilitadas : []
    if (!habilitadas.length) return true
    if (!empleadaId || empleadaId === "sin_asignar") return true
    return habilitadas.includes(empleadaId)
  }
  const getServiciosDisponiblesParaEmpleada = (empleadaId: string) =>
    serviciosPrincipales.filter((s: any) => {
      const habilitadas = (s as any).empleadas_habilitadas || []
      if (!habilitadas.length) return true
      if (!empleadaId || empleadaId === "sin_asignar") return true
      return habilitadas.includes(empleadaId)
    })
  const serviciosDisponibles = getServiciosDisponiblesParaEmpleada(formData.empleada_id)
  const serviciosFiltrados = servicioQuery
    ? serviciosDisponibles.filter((s) => `${s.nombre} ${s.duracion_minutos} ${s.precio}`.toLowerCase().includes(servicioQuery.toLowerCase()))
    : serviciosDisponibles
  const selectedServicio = serviciosPrincipales.find((s) => s.id === formData.servicio_id)
  const isEditing = Boolean(turno)
  const isFutureTurno = turno ? new Date(turno.fecha_inicio).getTime() > Date.now() : true
  const empleadasFiltradas = empleadas.filter((e) =>
    `${e.nombre} ${e.apellido || ""}`.toLowerCase().includes(empleadaQuery.toLowerCase()),
  )
  const clientesFiltrados = clientes.filter((c) =>
    `${c.nombre} ${c.apellido} ${c.telefono || ""}`.toLowerCase().includes(clienteQuery.toLowerCase()),
  )
  const selectedCliente = clientes.find((c) => c.id === formData.cliente_id) || null
  const selectedEmpleada = empleadas.find((e) => e.id === formData.empleada_id) || null
  const showClienteResultados =
    Boolean(clienteQuery) &&
    (!selectedCliente || clienteQuery.toLowerCase() !== `${selectedCliente.nombre} ${selectedCliente.apellido}`.trim().toLowerCase())
  const showServicioResultados =
    servicioListOpen ||
    (Boolean(servicioQuery) && (!selectedServicio || servicioQuery.toLowerCase() !== selectedServicio.nombre.toLowerCase()))
  const hasGiftcards = giftcardsParaDialog.length > 0
  const hasSenas = senasParaDialog.length > 0

  const { data: config } = useSWR<Config>("/api/config", fetcher)

  const metodosPagoList = useMemo(() => {
    const normalizados = Array.isArray(config?.metodos_pago_config)
      ? config.metodos_pago_config
          .map((m) => String(m?.nombre || "").trim())
          .filter(Boolean)
      : []
    const unicos = Array.from(new Set(normalizados))
    return unicos.length ? unicos : ["efectivo", "tarjeta", "transferencia"]
  }, [config?.metodos_pago_config])

  useEffect(() => {
    if (!metodosPagoList.length) return
    setSenaForm((prev) =>
      metodosPagoList.includes(prev.metodo_pago) ? prev : { ...prev, metodo_pago: metodosPagoList[0] },
    )
    setIncrementoMetodo((prev) => (metodosPagoList.includes(prev) ? prev : metodosPagoList[0]))
  }, [metodosPagoList])

  const handleAddSimultaneo = () => {
    setSimultaneos((prev) => [
      ...prev,
      {
        id: createSimultaneoId(),
        servicio_id: "",
        empleada_id: "",
        duracion_minutos: "",
      },
    ])
  }

  useEffect(() => {
    if (turno) {
      setFormData({
        cliente_id: turno.cliente_id,
        servicio_id: turno.servicio_id,
        fecha_inicio: formatForInput(turno.fecha_inicio),
        duracion_minutos: turno.duracion_minutos,
        observaciones: turno.observaciones || "",
        empleada_id: turno.empleada_id || "",
      })
      setDuracionEditadaManualmente(false)
      setSimultaneos([])
    } else {
      setFormData((prev) => {
        const nextFecha = initialFecha ? formatForInput(initialFecha) : prev.fecha_inicio
        const nextEmpleada = initialEmpleadaId || prev.empleada_id
        if (prev.fecha_inicio === nextFecha && prev.empleada_id === nextEmpleada) return prev
        return {
          ...prev,
          fecha_inicio: nextFecha,
          empleada_id: nextEmpleada,
        }
      })
      setDuracionEditadaManualmente(false)
    }
  }, [turno, initialFecha, initialEmpleadaId])

  useEffect(() => {
    if (!formData.empleada_id && empleadas.length) {
      setFormData((prev) => ({ ...prev, empleada_id: empleadas[0].id }))
    }
  }, [empleadas, formData.empleada_id])

  useEffect(() => {
    if (isEditing) return
    if (!empleadas.length || !serviciosPrincipales.length) return
    const serviciosActuales = getServiciosDisponiblesParaEmpleada(formData.empleada_id)
    if (serviciosActuales.length > 0) return
    const fallbackStaff = empleadas.find((e) => getServiciosDisponiblesParaEmpleada(e.id).length > 0)
    if (!fallbackStaff || fallbackStaff.id === formData.empleada_id) return
    setFormData((prev) => ({ ...prev, empleada_id: fallbackStaff.id }))
  }, [isEditing, empleadas, formData.empleada_id, serviciosPrincipales])

  useEffect(() => {
    if (formData.cliente_id) {
      const cliente = clientes.find((c) => c.id === formData.cliente_id)
      if (cliente) {
        setClienteQuery(`${cliente.nombre} ${cliente.apellido}`.trim())
      }
    } else {
      setClienteQuery("")
    }
  }, [clientes, formData.cliente_id])

  useEffect(() => {
    if (formData.servicio_id) {
      const servicio = serviciosPrincipales.find((s) => s.id === formData.servicio_id)
      if (servicio) {
        setServicioQuery(servicio.nombre)
      }
    } else {
      setServicioQuery("")
    }
  }, [formData.servicio_id, serviciosPrincipales])

  useEffect(() => {
    if (formData.empleada_id) {
      const empleada = empleadas.find((e) => e.id === formData.empleada_id)
      if (empleada) {
        setEmpleadaQuery(`${empleada.nombre} ${empleada.apellido}`.trim())
      }
    } else {
      setEmpleadaQuery("")
    }
  }, [empleadas, formData.empleada_id])

  useEffect(() => {
    if (!formData.empleada_id || !formData.servicio_id || !serviciosPrincipales.length) {
      prevEmpleadaIdRef.current = formData.empleada_id
      return
    }
    if (prevEmpleadaIdRef.current == null) {
      prevEmpleadaIdRef.current = formData.empleada_id
      return
    }
    if (prevEmpleadaIdRef.current !== formData.empleada_id) {
      prevEmpleadaIdRef.current = formData.empleada_id
      if (!isServicioHabilitado(formData.servicio_id, formData.empleada_id)) {
        const servicio = serviciosPrincipales.find((s) => s.id === formData.servicio_id)
        setFormData((prev) => ({ ...prev, servicio_id: "" }))
        setServicioQuery("")
        setErrorMessage(
          `La empleada seleccionada no está habilitada para ${servicio?.nombre || "este servicio"}. Seleccioná otro.`,
        )
      }
    }
  }, [formData.empleada_id, formData.servicio_id, serviciosPrincipales])

  useEffect(() => {
    onMetaChange?.({
      fecha_inicio: formData.fecha_inicio,
      empleada_id: formData.empleada_id,
      servicio_id: formData.servicio_id,
    })
  }, [formData.fecha_inicio, formData.empleada_id, formData.servicio_id, onMetaChange])

  const closeSenasDialog = () => {
    setShowSenasClienteDialog(false)
    setShowSenaForm(false)
    setShowIncrementarForm(false)
    setSenaExistente(null)
    setSenaErrorMessage(null)
    setSenaErrors({})
    setIncrementoErrors({})
    setSenaForm({ monto: "", metodo_pago: metodosPagoList[0] || "efectivo", nota: "", servicio_id: "" })
    setFacturarSena(false)
    setFacturarIncremento(false)
    setIncrementoMonto("")
    setIncrementoMetodo(metodosPagoList[0] || "efectivo")
    setGiftcardsParaDialog([])
  }

  const handleSelectCliente = async (clienteId: string) => {
    if (buscandoBeneficiosCliente) return

    setFormData((prev) => ({ ...prev, cliente_id: clienteId }))
    if (fieldErrors.cliente) {
      setFieldErrors((prev) => ({ ...prev, cliente: undefined }))
    }
    const cliente = clientes.find((c) => c.id === clienteId)
    if (cliente) setClienteQuery(`${cliente.nombre} ${cliente.apellido}`.trim())

    setBuscandoBeneficiosCliente(true)
    setSenasParaDialog([])
    setGiftcardsParaDialog([])

    try {
      const [senasResult, giftcardsResult] = await Promise.allSettled([
        fetch(`/api/senas?cliente_id=${clienteId}&estado=pendiente`).then((res) => res.json()),
        fetch(`/api/giftcards?cliente_id=${clienteId}&estado=vigente`).then((res) => res.json()),
      ])

      let abrirDialogo = false

      if (senasResult.status === "fulfilled" && Array.isArray(senasResult.value)) {
        setSenasParaDialog(senasResult.value)
        abrirDialogo = true
      } else if (senasResult.status === "rejected") {
        console.error("Error fetching señas:", senasResult.reason)
      }

      if (giftcardsResult.status === "fulfilled" && Array.isArray(giftcardsResult.value)) {
        setGiftcardsParaDialog(giftcardsResult.value)
        abrirDialogo = true
      } else if (giftcardsResult.status === "rejected") {
        console.error("Error fetching giftcards:", giftcardsResult.reason)
      }

      if (abrirDialogo) {
        setShowSenasClienteDialog(true)
        setShowSenaForm(false)
        setShowIncrementarForm(false)
        setSenaExistente(null)
      }
    } finally {
      setBuscandoBeneficiosCliente(false)
    }
  }

  const handleCrearCliente = async () => {
    if (!nuevoCliente.nombre.trim()) {
      setClienteFormErrors({ nombre: "Ingresa el nombre." })
      return
    }

    setGuardandoCliente(true)
    setClienteError(null)
    setClienteFormErrors({})

    try {
      const res = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nuevoCliente.nombre.trim(),
          apellido: nuevoCliente.apellido.trim(),
          telefono: nuevoCliente.telefono.trim() || null,
        }),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        setClienteError(error?.error || "No se pudo crear la clienta")
        return
      }

      const data = await res.json()
      setFormData((prev) => ({ ...prev, cliente_id: data.id }))
      setClienteQuery(`${data.nombre} ${data.apellido}`.trim())
      setShowCrearClienteDialog(false)
      setNuevoCliente({ nombre: "", apellido: "", telefono: "" })
      setClienteFormErrors({})
    } catch (error) {
      console.error("Error:", error)
      setClienteError("Ocurrio un error al crear la clienta")
    } finally {
      setGuardandoCliente(false)
    }
  }

  const handleIncrementarSena = async () => {
    if (!senaExistente || !incrementoMonto || Number(incrementoMonto) <= 0) {
      setIncrementoErrors({ monto: "Ingresa un monto válido para incrementar." })
      return
    }

    setGuardandoIncremento(true)
    setSenaErrorMessage(null)
    setIncrementoErrors({})
    if (facturarIncremento) setFacturando(true)

    try {
      const res = await fetch(`/api/senas/${senaExistente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incremento: Number(incrementoMonto),
          metodo_pago: incrementoMetodo,
          facturar: facturarIncremento,
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setSenaErrorMessage(payload?.error || "No se pudo incrementar la seña")
        return
      }
      if (payload?.factura_pendiente) {
        const detalle = payload?.factura_error ? `\nDetalle: ${payload.factura_error}` : ""
        alert(`Incremento registrado. El comprobante quedó pendiente y se reintentará automáticamente.${detalle}`)
      } else if (payload?.factura_error) {
        alert(`Incremento registrado. No se pudo facturar: ${payload.factura_error}`)
      }
      if (payload?.factura_id && !payload?.factura_pendiente) {
        setFacturaInfo(payload?.factura || null)
        setFacturaId(payload?.factura_id || null)
        setFacturaOpen(true)
      }

      const refetch = await fetch(`/api/senas?cliente_id=${formData.cliente_id}&estado=pendiente`)
      const updated = await refetch.json()
      if (Array.isArray(updated)) setSenasParaDialog(updated)
      setShowIncrementarForm(false)
      setSenaExistente(null)
      setIncrementoMonto("")
      setIncrementoMetodo(metodosPagoList[0] || "efectivo")
      setFacturarIncremento(false)
    } catch (error) {
      console.error("Error:", error)
      setSenaErrorMessage("Ocurrio un error al incrementar la seña")
    } finally {
      setFacturando(false)
      setGuardandoIncremento(false)
    }
  }

  const handleCrearSena = async () => {
    if (!formData.cliente_id || !senaForm.monto || !senaForm.servicio_id) {
      const nextErrors: { servicio?: string; monto?: string } = {}
      if (!senaForm.servicio_id) nextErrors.servicio = "Selecciona un servicio."
      if (!senaForm.monto || Number(senaForm.monto) <= 0) nextErrors.monto = "Ingresa un monto válido."
      setSenaErrors(nextErrors)
      return
    }

    setGuardandoSena(true)
    setSenaErrorMessage(null)
    setSenaErrors({})
    if (facturarSena) setFacturando(true)

    try {
      const res = await fetch("/api/senas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: formData.cliente_id,
          servicio_id: senaForm.servicio_id,
          monto: senaForm.monto,
          metodo_pago: senaForm.metodo_pago,
          nota: senaForm.nota,
          fecha_pago: new Date().toISOString(),
          facturar: facturarSena,
        }),
      })

      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setSenaErrorMessage(payload?.error || "No se pudo registrar la se\u00f1a.")
        return
      }
      if (payload?.factura_pendiente) {
        const detalle = payload?.factura_error ? `\nDetalle: ${payload.factura_error}` : ""
        alert(`Seña registrada. El comprobante quedó pendiente y se reintentará automáticamente.${detalle}`)
      } else if (payload?.factura_error) {
        alert(`Seña registrada. No se pudo facturar: ${payload.factura_error}`)
      }
      if (payload?.factura_id && !payload?.factura_pendiente) {
        setFacturaInfo(payload?.factura || null)
        setFacturaId(payload?.factura_id || null)
        setFacturaOpen(true)
      }

      const refetch = await fetch(`/api/senas?cliente_id=${formData.cliente_id}&estado=pendiente`)
      const updated = await refetch.json()
      if (Array.isArray(updated)) setSenasParaDialog(updated)
      setShowSenaForm(false)
      setSenaForm({ monto: "", metodo_pago: metodosPagoList[0] || "efectivo", nota: "", servicio_id: "" })
      setSenaErrors({})
      setFacturarSena(false)
    } catch (error) {
      console.error("Error:", error)
      setSenaErrorMessage("Ocurrió un error al registrar la seña.")
    } finally {
      setFacturando(false)
      setGuardandoSena(false)
    }
  }

  const checkRecursosDisponibilidad = async (items: SimultaneoItem[], startDate: Date) => {
    const hayRecursos = items.some((item) => {
      const servicio = serviciosPrincipales.find((s: any) => s.id === item.servicio_id)
      return Boolean((servicio as any)?.recurso_id)
    })
    if (!hayRecursos) return []

    try {
      const res = await fetch("/api/recursos/disponibilidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha_inicio: startDate.toISOString(),
          turnos: items.map((item) => ({
            servicio_id: item.servicio_id,
            duracion_minutos: Number.parseInt(String(item.duracion_minutos)),
          })),
          excluir_turno_ids: turno ? [turno.id] : [],
        }),
      })

      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data?.conflictos) ? data.conflictos : []
    } catch (error) {
      console.warn("No se pudo validar disponibilidad de recursos", error)
      return []
    }
  }

  const submitTurno = async (skipRecursosCheck = false) => {
    setLoading(true)
    setErrorMessage(null)
    setFieldErrors({})
    setSimultaneoErrors({})

    const startDate = new Date(formData.fecha_inicio)
    if (Number.isNaN(startDate.getTime())) {
      setLoading(false)
      setFieldErrors((prev) => ({ ...prev, fecha_inicio: "Selecciona una fecha y hora válidas." }))
      return
    }

    const baseItem = {
      servicio_id: formData.servicio_id,
      empleada_id: formData.empleada_id,
      duracion_minutos: Number.parseInt(formData.duracion_minutos.toString()),
      observaciones: formData.observaciones,
    }

    const items: SimultaneoItem[] = [
      { id: "principal", ...baseItem },
      ...simultaneos.map((s) => ({ ...s, observaciones: formData.observaciones })),
    ]

    const nextFieldErrors: typeof fieldErrors = {}
    if (!formData.cliente_id) nextFieldErrors.cliente = "Selecciona una clienta."
    if (!baseItem.servicio_id) nextFieldErrors.servicio = "Selecciona un servicio."
    if (!baseItem.empleada_id) nextFieldErrors.empleada = "Selecciona una staff."
    if (Number.isNaN(baseItem.duracion_minutos) || baseItem.duracion_minutos <= 0) {
      nextFieldErrors.duracion_minutos = "Ingresa una duración válida."
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setLoading(false)
      return
    }

    const itemNoHabilitado = items.find((item) => !isServicioHabilitado(item.servicio_id, item.empleada_id))
    if (itemNoHabilitado) {
      const servicio = serviciosPrincipales.find((s) => s.id === itemNoHabilitado.servicio_id)
      const staff = empleadas.find((e) => e.id === itemNoHabilitado.empleada_id)
      const staffLabel = staff ? [staff.nombre, staff.apellido].filter(Boolean).join(" ") : "la empleada"
      setLoading(false)
      setErrorMessage(
        `${staffLabel} no está habilitada para ${servicio?.nombre || "ese servicio"}. Seleccioná otro servicio o staff.`,
      )
      return
    }

    if (!isEditing && items.length > 1) {
      const staffSet = new Set<string>()
      const nextSimErrors: typeof simultaneoErrors = {}
      for (const item of items) {
        if (item.id === "principal") continue
        const itemErrors: { servicio?: string; empleada?: string; duracion?: string } = {}
        if (!item.servicio_id) itemErrors.servicio = "Selecciona un servicio."
        if (!item.empleada_id) itemErrors.empleada = "Selecciona una staff."
        if (!item.duracion_minutos || Number(item.duracion_minutos) <= 0) {
          itemErrors.duracion = "Ingresa una duración válida."
        }
        if (Object.keys(itemErrors).length > 0) {
          nextSimErrors[item.id] = itemErrors
        }
        if (item.empleada_id) {
          if (staffSet.has(item.empleada_id)) {
            setLoading(false)
            setErrorMessage("Una empleada no puede estar asignada dos veces en el mismo turno simultáneo.")
            return
          }
          staffSet.add(item.empleada_id)
        }
      }
      if (Object.keys(nextSimErrors).length > 0) {
        setSimultaneoErrors(nextSimErrors)
        setLoading(false)
        return
      }
    }

    try {
      if (!skipRecursosCheck) {
        const conflictos = await checkRecursosDisponibilidad(items, startDate)
        if (conflictos.length > 0) {
          setRecursosConflicto(conflictos)
          setShowRecursosDialog(true)
          setLoading(false)
          return
        }
      }

      const isGroup = !isEditing && items.length > 1
      const endpoint = isEditing && turno ? `/api/turnos/${turno.id}` : isGroup ? "/api/turnos/grupo" : "/api/turnos"
      const method = isEditing ? "PUT" : "POST"
      const payload = isGroup
        ? {
            cliente_id: formData.cliente_id,
            fecha_inicio: startDate.toISOString(),
            turnos: items.map((item) => ({
              servicio_id: item.servicio_id,
              empleada_id: item.empleada_id,
              duracion_minutos: Number.parseInt(String(item.duracion_minutos)),
              observaciones: item.observaciones,
            })),
          }
        : {
            cliente_id: formData.cliente_id,
            servicio_id: formData.servicio_id,
            empleada_id: formData.empleada_id,
            fecha_inicio: startDate.toISOString(),
            duracion_minutos: Number.parseInt(formData.duracion_minutos.toString()),
            observaciones: formData.observaciones,
          }

      if (skipRecursosCheck) {
        ;(payload as any).skip_recursos_check = true
      }

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({}))
        if (Array.isArray(error?.conflictos) && error.conflictos.length > 0) {
          setRecursosConflicto(error.conflictos)
          setShowRecursosDialog(true)
          return
        }
        setErrorMessage(error?.error || "No se pudo guardar el turno")
        return
      }

      onSuccess()
      if (!isEditing) {
        setFormData({
          cliente_id: "",
          servicio_id: "",
          fecha_inicio: "",
          duracion_minutos: "",
          observaciones: "",
          empleada_id: "",
        })
        setDuracionEditadaManualmente(false)
        setSimultaneos([])
      }
    } catch (error) {
      console.error("Error:", error)
      setErrorMessage("Ocurrió un error al guardar el turno")
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    await submitTurno()
  }

  const handleConfirmRecursos = async () => {
    setShowRecursosDialog(false)
    await submitTurno(true)
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="turno-cliente-search" className="text-sm font-medium">Cliente</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="turno-cliente-search"
                  className="pl-9"
                  placeholder="Buscar clienta por nombre o teléfono"
                  value={clienteQuery}
                  disabled={buscandoBeneficiosCliente}
                  onChange={(e) => setClienteQuery(e.target.value)}
                />
              </div>
              {fieldErrors.cliente && <p className="text-xs text-destructive mt-1">{fieldErrors.cliente}</p>}
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={buscandoBeneficiosCliente}
                onClick={() => setShowCrearClienteDialog(true)}
                title="Nueva clienta"
              >
                <PlusIcon className="h-4 w-4" />
              </Button>
            </div>
            {formData.cliente_id && (
              <p className="text-xs text-muted-foreground">
                Seleccionada:{" "}
                <span className="font-medium text-foreground">
                  {selectedCliente?.nombre} {selectedCliente?.apellido}
                </span>
              </p>
            )}
            {showClienteResultados && (
              <div className="space-y-1 rounded-md border bg-muted/40 p-2 max-h-48 overflow-y-auto">
                {clientesFiltrados.length ? (
                  clientesFiltrados.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      variant={formData.cliente_id === c.id ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                      disabled={buscandoBeneficiosCliente}
                      onClick={() => handleSelectCliente(c.id)}
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-medium">
                          {c.nombre} {c.apellido}
                        </span>
                        {c.telefono ? <span className="text-[11px] text-muted-foreground">{c.telefono}</span> : null}
                      </div>
                    </Button>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                )}
              </div>
            )}
          </div>

          <div
            className="space-y-2"
            ref={servicioContainerRef}
            onFocus={() => {
              if (servicioBlurRef.current) clearTimeout(servicioBlurRef.current)
              setServicioListOpen(true)
            }}
            onBlur={(event) => {
              if (servicioBlurRef.current) clearTimeout(servicioBlurRef.current)
              const next = event.relatedTarget as Node | null
              if (next && servicioContainerRef.current?.contains(next)) return
              servicioBlurRef.current = setTimeout(() => setServicioListOpen(false), 200)
            }}
          >
            <label htmlFor="turno-servicio-search" className="text-sm font-medium">Servicio</label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="turno-servicio-search"
              className="pl-9"
              placeholder="Buscar servicio"
              value={servicioQuery}
              onChange={(e) => setServicioQuery(e.target.value)}
            />
          </div>
          {fieldErrors.servicio && <p className="text-xs text-destructive mt-1">{fieldErrors.servicio}</p>}
            {formData.servicio_id && (
              <p className="text-xs text-muted-foreground">
                Seleccionado:{" "}
                <span className="font-medium text-foreground">
                  {selectedServicio?.nombre || "Servicio"}{" "}
                  {selectedServicio ? `- ${selectedServicio.duracion_minutos} min` : ""}
                </span>
              </p>
            )}
            {showServicioResultados && (
              <div className="space-y-1 rounded-md border bg-muted/40 p-2 max-h-48 overflow-y-auto">
                {serviciosFiltrados.length ? (
                  serviciosFiltrados.map((s) => {
                    const precio = Number((s as any).precio ?? (s as any).precio_lista ?? 0)
                    return (
                      <Button
                        key={s.id}
                        type="button"
                        variant={formData.servicio_id === s.id ? "secondary" : "ghost"}
                        size="sm"
                        className="w-full justify-start"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setErrorMessage(null)
                          const shouldKeepManualDuration = duracionEditadaManualmente && formData.duracion_minutos !== ""
                          setFormData((prev) => ({
                            ...prev,
                            servicio_id: s.id,
                            duracion_minutos: shouldKeepManualDuration ? prev.duracion_minutos : s.duracion_minutos,
                          }))
                          if (!shouldKeepManualDuration) {
                            setDuracionEditadaManualmente(false)
                          }
                          setServicioQuery(s.nombre)
                          setServicioListOpen(false)
                          if (fieldErrors.servicio) {
                            setFieldErrors((prev) => ({ ...prev, servicio: undefined }))
                          }
                        }}
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-medium">{s.nombre}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {s.duracion_minutos} min - ${precio.toFixed(2)}
                          </span>
                        </div>
                      </Button>
                    )
                  })
                ) : (
                  <p className="text-xs text-muted-foreground">No hay servicios habilitados para esta búsqueda.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isEditing && (
            <div>
              <label htmlFor="turno-fecha-inicio" className="text-sm font-medium">Fecha y Hora</label>
              <Input
                id="turno-fecha-inicio"
                type="datetime-local"
                value={formData.fecha_inicio}
                onChange={(e) => {
                  setFormData({ ...formData, fecha_inicio: e.target.value })
                  if (fieldErrors.fecha_inicio) {
                    setFieldErrors((prev) => ({ ...prev, fecha_inicio: undefined }))
                  }
                }}
                step={300}
                required
              />
              {fieldErrors.fecha_inicio && <p className="text-xs text-destructive mt-1">{fieldErrors.fecha_inicio}</p>}
            </div>
          )}
          <div className={isEditing ? "" : "sm:col-span-2"}>
            <label htmlFor="turno-duracion" className="text-sm font-medium">Duración (minutos)</label>
            <Input
              id="turno-duracion"
              type="number"
              value={formData.duracion_minutos}
              onChange={(e) => {
                setDuracionEditadaManualmente(true)
                setFormData({
                  ...formData,
                  duracion_minutos: e.target.value === "" ? "" : Number.parseInt(e.target.value),
                })
                if (fieldErrors.duracion_minutos) {
                  setFieldErrors((prev) => ({ ...prev, duracion_minutos: undefined }))
                }
              }}
              placeholder={selectedServicio?.duracion_minutos.toString() || "60"}
              min={5}
              step={5}
              required
            />
            {fieldErrors.duracion_minutos && (
              <p className="text-xs text-destructive mt-1">{fieldErrors.duracion_minutos}</p>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Servicios simultáneos</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={handleAddSimultaneo} className="gap-1.5">
                <PlusIcon className="h-3.5 w-3.5" />
                Agregar
              </Button>
            </div>
            {simultaneos.length > 0 && (
              <div className="space-y-2">
                {simultaneos.map((item) => {
                  const servicioQueryValue = simultaneoServicioQuery[item.id] ?? ""
                  const staffQueryValue = simultaneoStaffQuery[item.id] ?? ""
                  const servicioSeleccionado = serviciosPrincipales.find((s) => s.id === item.servicio_id)
                  const staffSeleccionado = empleadas.find((e) => e.id === item.empleada_id)
                  const staffLabel = staffSeleccionado
                    ? `${staffSeleccionado.nombre} ${staffSeleccionado.apellido || ""}`.trim()
                    : ""
                  const serviciosDisponiblesSimultaneo = getServiciosDisponiblesParaEmpleada(item.empleada_id)
                  const serviciosFiltradosSimultaneo = servicioQueryValue
                    ? serviciosDisponiblesSimultaneo.filter((s) =>
                        `${s.nombre} ${s.duracion_minutos}`.toLowerCase().includes(servicioQueryValue.toLowerCase()),
                      )
                    : serviciosDisponiblesSimultaneo
                  const staffFiltradoSimultaneo = staffQueryValue
                    ? empleadas.filter((e) =>
                        `${e.nombre} ${e.apellido || ""}`.toLowerCase().includes(staffQueryValue.toLowerCase()),
                      )
                    : empleadas
                  const showServicioResultadosSimultaneo =
                    Boolean(servicioQueryValue) &&
                    (!servicioSeleccionado || servicioQueryValue.toLowerCase() !== servicioSeleccionado.nombre.toLowerCase())
                  const showStaffResultadosSimultaneo =
                    Boolean(staffQueryValue) && (!staffLabel || staffQueryValue.toLowerCase() !== staffLabel.toLowerCase())

                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-1 gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_1fr_110px_auto]"
                    >
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Servicio</p>
                        <div className="relative">
                          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="pl-9"
                            placeholder="Buscar servicio"
                            value={servicioQueryValue}
                            onChange={(e) => {
                              const value = e.target.value
                              setSimultaneoServicioQuery((prev) => ({ ...prev, [item.id]: value }))
                            }}
                          />
                        </div>
                        {simultaneoErrors[item.id]?.servicio && (
                          <p className="text-xs text-destructive mt-1">{simultaneoErrors[item.id]?.servicio}</p>
                        )}
                        {item.servicio_id && (
                          <p className="text-[11px] text-muted-foreground">
                            Seleccionado:{" "}
                            <span className="font-medium text-foreground">
                              {servicioSeleccionado?.nombre || "Servicio"}
                              {servicioSeleccionado ? ` · ${servicioSeleccionado.duracion_minutos} min` : ""}
                            </span>
                          </p>
                        )}
                        {showServicioResultadosSimultaneo && (
                          <div className="space-y-1 rounded-md border bg-muted/40 p-2 max-h-40 overflow-y-auto">
                            {serviciosFiltradosSimultaneo.length ? (
                              serviciosFiltradosSimultaneo.map((s) => (
                                <Button
                                  key={s.id}
                                  type="button"
                                  variant={item.servicio_id === s.id ? "secondary" : "ghost"}
                                  size="sm"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    if (!isServicioHabilitado(s.id, item.empleada_id)) {
                                      setErrorMessage(
                                        `La empleada seleccionada no está habilitada para ${s.nombre}. Seleccioná otro servicio.`,
                                      )
                                      return
                                    }
                                    setErrorMessage(null)
                                    setSimultaneos((prev) =>
                                      prev.map((sim) =>
                                        sim.id === item.id
                                          ? { ...sim, servicio_id: s.id, duracion_minutos: s.duracion_minutos }
                                          : sim,
                                      ),
                                    )
                                    setSimultaneoServicioQuery((prev) => ({ ...prev, [item.id]: s.nombre }))
                                    if (simultaneoErrors[item.id]?.servicio) {
                                      setSimultaneoErrors((prev) => ({ ...prev, [item.id]: { ...prev[item.id], servicio: undefined } }))
                                    }
                                  }}
                                >
                                  <div className="flex flex-col items-start">
                                    <span className="font-medium">{s.nombre}</span>
                                    <span className="text-[11px] text-muted-foreground">{s.duracion_minutos} min</span>
                                  </div>
                                </Button>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {item.empleada_id ? "No hay servicios habilitados para esta staff." : "No hay coincidencias."}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Staff</p>
                        <div className="relative">
                          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            className="pl-9"
                            placeholder="Buscar staff"
                            value={staffQueryValue}
                            onChange={(e) => {
                              const value = e.target.value
                              setSimultaneoStaffQuery((prev) => ({ ...prev, [item.id]: value }))
                            }}
                          />
                        </div>
                        {simultaneoErrors[item.id]?.empleada && (
                          <p className="text-xs text-destructive mt-1">{simultaneoErrors[item.id]?.empleada}</p>
                        )}
                        {item.empleada_id && (
                          <p className="text-[11px] text-muted-foreground">
                            Seleccionada: <span className="font-medium text-foreground">{staffLabel || "Staff"}</span>
                          </p>
                        )}
                        {showStaffResultadosSimultaneo && (
                          <div className="space-y-1 rounded-md border bg-muted/40 p-2 max-h-40 overflow-y-auto">
                            {staffFiltradoSimultaneo.length ? (
                              staffFiltradoSimultaneo.map((e) => (
                                <Button
                                  key={e.id}
                                  type="button"
                                  variant={item.empleada_id === e.id ? "secondary" : "ghost"}
                                  size="sm"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    const servicioActual = serviciosPrincipales.find((s) => s.id === item.servicio_id)
                                    const habilitado = servicioActual ? isServicioHabilitado(servicioActual.id, e.id) : true
                                    setSimultaneos((prev) =>
                                      prev.map((sim) =>
                                        sim.id === item.id
                                          ? { ...sim, empleada_id: e.id, servicio_id: habilitado ? sim.servicio_id : "" }
                                          : sim,
                                      ),
                                    )
                                    setSimultaneoStaffQuery((prev) => ({
                                      ...prev,
                                      [item.id]: `${e.nombre} ${e.apellido || ""}`.trim(),
                                    }))
                                    if (!habilitado) {
                                      setSimultaneoServicioQuery((prev) => ({ ...prev, [item.id]: "" }))
                                      setErrorMessage(
                                        `La empleada seleccionada no está habilitada para ${servicioActual?.nombre || "este servicio"}. Seleccioná otro.`,
                                      )
                                    } else {
                                      setErrorMessage(null)
                                    }
                                    if (simultaneoErrors[item.id]?.empleada) {
                                      setSimultaneoErrors((prev) => ({ ...prev, [item.id]: { ...prev[item.id], empleada: undefined } }))
                                    }
                                  }}
                                >
                                  {e.nombre}
                                  {e.apellido ? ` ${e.apellido}` : ""}
                                </Button>
                              ))
                            ) : (
                              <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Duración</p>
                        <Input
                          type="number"
                          min={5}
                          step={5}
                          value={item.duracion_minutos}
                          onChange={(e) => {
                            const value = e.target.value === "" ? "" : Number.parseInt(e.target.value)
                            setSimultaneos((prev) => prev.map((s) => (s.id === item.id ? { ...s, duracion_minutos: value } : s)))
                            if (simultaneoErrors[item.id]?.duracion) {
                              setSimultaneoErrors((prev) => ({ ...prev, [item.id]: { ...prev[item.id], duracion: undefined } }))
                            }
                          }}
                        />
                        {simultaneoErrors[item.id]?.duracion && (
                          <p className="text-xs text-destructive mt-1">{simultaneoErrors[item.id]?.duracion}</p>
                        )}
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setSimultaneos((prev) => prev.filter((s) => s.id !== item.id))}
                          title="Quitar"
                        >
                          <Trash2Icon className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {isEditing && (
          <div className="space-y-2">
            <label htmlFor="turno-empleada-search" className="text-sm font-medium">Empleada</label>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="turno-empleada-search"
                className="pl-9"
                placeholder="Buscar y asignar staff"
                value={empleadaQuery}
                onChange={(e) => setEmpleadaQuery(e.target.value)}
              />
            </div>
            {fieldErrors.empleada && <p className="text-xs text-destructive mt-1">{fieldErrors.empleada}</p>}
            {formData.empleada_id && (
              <p className="text-xs text-muted-foreground">
                Seleccionada:{" "}
                <span className="font-medium text-foreground">
                  {selectedEmpleada?.nombre}
                  {selectedEmpleada?.apellido ? ` ${selectedEmpleada.apellido}` : ""}
                </span>
              </p>
            )}
            <div className="space-y-1 rounded-md border bg-muted/40 p-2 max-h-44 overflow-y-auto">
              {empleadasFiltradas.length ? (
                empleadasFiltradas.map((e) => (
                  <Button
                    key={e.id}
                    type="button"
                    variant={formData.empleada_id === e.id ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, empleada_id: e.id }))
                      setEmpleadaQuery(`${e.nombre} ${e.apellido || ""}`.trim())
                      if (fieldErrors.empleada) {
                        setFieldErrors((prev) => ({ ...prev, empleada: undefined }))
                      }
                    }}
                  >
                    {e.nombre}
                    {e.apellido ? ` ${e.apellido}` : ""}
                  </Button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No hay coincidencias.</p>
              )}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="turno-observaciones" className="text-sm font-medium">Observaciones</label>
          <Textarea
            id="turno-observaciones"
            value={formData.observaciones}
            onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
            rows={3}
          />
        </div>

        {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {isEditing && onCancel && (
            <Button type="button" variant="outline" className="gap-2" onClick={onCancel} disabled={loading}>
              <XIcon className="h-4 w-4" />
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={loading || (isEditing && !isFutureTurno)} className="gap-2">
            {loading ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : isEditing ? (
              <>
                <SaveIcon className="h-4 w-4" />
                Guardar cambios
              </>
            ) : (
              <>
                <CalendarPlusIcon className="h-4 w-4" />
                Crear turno
              </>
            )}
          </Button>
        </div>
      </form>

      <Dialog
        open={showSenasClienteDialog}
        onOpenChange={(open) => {
          if (!open) closeSenasDialog()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {showSenaForm ? (
            <>
              <DialogHeader>
                <DialogTitle>Registrar seña</DialogTitle>
                <DialogDescription>Completa los datos para registrar la seña.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  Clienta:{" "}
                  <span className="font-medium">
                    {selectedCliente ? `${selectedCliente.nombre} ${selectedCliente.apellido}` : "Selecciona una clienta"}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium">Servicio</p>
                  <Select
                    value={senaForm.servicio_id}
                    onValueChange={(v) => {
                      setSenaForm((prev) => ({ ...prev, servicio_id: v }))
                      if (senaErrors.servicio) setSenaErrors((prev) => ({ ...prev, servicio: undefined }))
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar servicio" />
                    </SelectTrigger>
                    <SelectContent>
                      {servicios.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nombre} - ${Number((s as any).precio ?? (s as any).precio_lista ?? 0).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {senaErrors.servicio && <p className="text-xs text-destructive mt-1">{senaErrors.servicio}</p>}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">Monto</p>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={senaForm.monto}
                      onChange={(e) => {
                        setSenaForm((prev) => ({ ...prev, monto: e.target.value === "" ? "" : Number.parseFloat(e.target.value) }))
                        if (senaErrors.monto) setSenaErrors((prev) => ({ ...prev, monto: undefined }))
                      }}
                    />
                    {senaErrors.monto && <p className="text-xs text-destructive mt-1">{senaErrors.monto}</p>}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Método</p>
                    <Select
                      value={senaForm.metodo_pago}
                      onValueChange={(v) => setSenaForm((prev) => ({ ...prev, metodo_pago: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {metodosPagoList.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium">Nota</p>
                  <Input value={senaForm.nota} onChange={(e) => setSenaForm((prev) => ({ ...prev, nota: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <p className="text-sm font-medium">¿Facturar esta seña?</p>
                  <Switch checked={facturarSena} onCheckedChange={setFacturarSena} />
                </div>
                {senaErrorMessage && <p className="text-sm text-destructive">{senaErrorMessage}</p>}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={() => { setShowSenaForm(false); setSenaErrorMessage(null) }} disabled={guardandoSena}>
                    Volver
                  </Button>
                  <Button type="button" onClick={handleCrearSena} disabled={guardandoSena}>
                    {guardandoSena ? (
                      <>
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      "Registrar seña"
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : showIncrementarForm && senaExistente ? (
            <>
              <DialogHeader>
                <DialogTitle>Incrementar seña</DialogTitle>
                <DialogDescription>
                  {senaExistente.servicios?.nombre || "Servicio"} - Seña actual: ${Number(senaExistente.monto).toFixed(2)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-sm font-medium">Monto a incrementar</p>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={incrementoMonto}
                      onChange={(e) => {
                        setIncrementoMonto(e.target.value === "" ? "" : Number.parseFloat(e.target.value))
                        if (incrementoErrors.monto) setIncrementoErrors({})
                      }}
                    />
                    {incrementoErrors.monto && <p className="text-xs text-destructive mt-1">{incrementoErrors.monto}</p>}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Método</p>
                    <Select value={incrementoMetodo} onValueChange={setIncrementoMetodo}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {metodosPagoList.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <p className="text-sm font-medium">¿Facturar este incremento?</p>
                  <Switch checked={facturarIncremento} onCheckedChange={setFacturarIncremento} />
                </div>
                {incrementoMonto && Number(incrementoMonto) > 0 && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    Nueva seña: <span className="font-medium">${(Number(senaExistente.monto) + Number(incrementoMonto)).toFixed(2)}</span>
                  </div>
                )}
                {senaErrorMessage && <p className="text-sm text-destructive">{senaErrorMessage}</p>}
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowIncrementarForm(false)
                      setSenaExistente(null)
                      setSenaErrorMessage(null)
                      setFacturarIncremento(false)
                    }}
                    disabled={guardandoIncremento}
                  >
                    Volver
                  </Button>
                  <Button type="button" onClick={handleIncrementarSena} disabled={guardandoIncremento}>
                    {guardandoIncremento ? (
                      <>
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                        Incrementando...
                      </>
                    ) : (
                      "Incrementar"
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {hasGiftcards || hasSenas ? "Beneficios de la clienta" : "Clienta sin seña registrada"}
                </DialogTitle>
                <DialogDescription>
                  {hasGiftcards || hasSenas
                    ? `${selectedCliente?.nombre || ""} ${selectedCliente?.apellido || ""} tiene ${hasGiftcards ? `${giftcardsParaDialog.length} giftcard(s)` : ""}${
                        hasGiftcards && hasSenas ? " y " : ""
                      }${hasSenas ? `${senasParaDialog.length} seña(s) pendiente(s)` : ""}.`
                    : "¿Desea registrar una seña para esta clienta?"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {hasGiftcards && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Giftcards vigentes</p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {giftcardsParaDialog.map((g) => {
                        const serviciosLabel =
                          Array.isArray(g.servicios) && g.servicios.length
                            ? g.servicios.map((s) => s.nombre).join(", ")
                            : Array.isArray(g.servicio_ids)
                              ? g.servicio_ids
                                  .map((id) => servicios.find((srv) => srv.id === id)?.nombre)
                                  .filter(Boolean)
                                  .join(", ")
                              : "Servicios"
                        return (
                          <div key={g.id} className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            <p className="font-medium">Giftcard {g.numero}</p>
                            <p className="text-xs text-muted-foreground">Servicios: {serviciosLabel}</p>
                            {g.valido_hasta && (
                              <p className="text-xs text-muted-foreground">
                                Vence: {new Date(g.valido_hasta).toLocaleDateString("es-AR")}
                              </p>
                            )}
                            {g.de_parte_de && (
                              <p className="text-xs text-muted-foreground">De parte de: {g.de_parte_de}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {hasSenas ? (
                  <div className="space-y-3">
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {senasParaDialog.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                          <div>
                            <p className="text-sm font-medium">{s.servicios?.nombre || "Sin servicio"}</p>
                            <p className="text-xs text-muted-foreground">${Number(s.monto).toFixed(2)}</p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSenaExistente(s)
                              setShowIncrementarForm(true)
                              setSenaErrorMessage(null)
                            }}
                          >
                            Incrementar
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-md border bg-primary/10 px-3 py-2 text-sm font-medium">
                      Total señas: ${senasParaDialog.reduce((acc, s) => acc + Number(s.monto || 0), 0).toFixed(2)}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                      <Button type="button" variant="outline" onClick={closeSenasDialog}>
                        Cerrar
                      </Button>
                      <Button type="button" onClick={() => { setShowSenaForm(true); setSenaErrorMessage(null) }}>
                        Registrar nueva seña
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={closeSenasDialog}>
                      No, cerrar
                    </Button>
                    <Button type="button" onClick={() => { setShowSenaForm(true); setSenaErrorMessage(null) }}>
                      Sí, registrar seña
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <FacturaDialog
        open={facturaOpen}
        onOpenChange={(open) => {
          setFacturaOpen(open)
          if (!open) setFacturaId(null)
        }}
        facturaId={facturaId}
        factura={facturaInfo}
      />
      <FacturandoDialog open={facturando} />

      <Dialog open={buscandoBeneficiosCliente}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-sm"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Buscando beneficios de la clienta...</DialogTitle>
            <DialogDescription>
              Estamos consultando señas y giftcards. Espera un momento.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center py-3">
            <Loader2Icon className="h-6 w-6 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCrearClienteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowCrearClienteDialog(false)
            setNuevoCliente({ nombre: "", apellido: "", telefono: "" })
            setClienteError(null)
          }
        }}
      >
      <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva clienta</DialogTitle>
            <DialogDescription>Completa los datos para crear una nueva clienta.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium">Nombre *</p>
              <Input
                placeholder="Nombre"
                value={nuevoCliente.nombre}
                onChange={(e) => {
                  setNuevoCliente((prev) => ({ ...prev, nombre: e.target.value }))
                  if (clienteFormErrors.nombre) setClienteFormErrors({})
                }}
              />
              {clienteFormErrors.nombre && <p className="text-xs text-destructive">{clienteFormErrors.nombre}</p>}
            </div>
              <div>
                <p className="text-sm font-medium">Apellido</p>
                <Input
                  placeholder="Apellido"
                  value={nuevoCliente.apellido}
                  onChange={(e) => setNuevoCliente((prev) => ({ ...prev, apellido: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium">Teléfono</p>
              <Input
                placeholder="Teléfono (opcional)"
                value={nuevoCliente.telefono}
                onChange={(e) => setNuevoCliente((prev) => ({ ...prev, telefono: e.target.value }))}
              />
            </div>
            {clienteError && <p className="text-sm text-destructive">{clienteError}</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCrearClienteDialog(false)
                  setNuevoCliente({ nombre: "", apellido: "", telefono: "" })
                  setClienteError(null)
                }}
                disabled={guardandoCliente}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleCrearCliente} disabled={guardandoCliente}>
                {guardandoCliente ? (
                  <>
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                    Creando...
                  </>
                ) : (
                  "Crear clienta"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={showRecursosDialog}
        onOpenChange={(open) => {
          setShowRecursosDialog(open)
          if (!open) setRecursosConflicto([])
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5 text-[color:var(--status-warning-fg)]" />
              Recursos insuficientes
            </AlertDialogTitle>
            <AlertDialogDescription>
              En el horario seleccionado se supera la cantidad disponible de recursos. Podés cancelar o continuar igual.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            {recursosConflicto.map((conflicto) => (
              <div key={conflicto.recurso_id} className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <p className="font-medium">{conflicto.recurso_nombre}</p>
                <p className="text-xs text-muted-foreground">
                  Disponible: {conflicto.cantidad_disponible} · Necesario: {conflicto.max_simultaneos}
                </p>
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmRecursos}>Continuar igual</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
