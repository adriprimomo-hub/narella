"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SicaipFooter } from "@/components/ui/sicaip-footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/date-format"

type DeclaracionCampo = {
  id: string
  label: string
  tipo: "text" | "textarea" | "number" | "date" | "yes_no" | "select"
  requerido: boolean
  placeholder?: string | null
  ayuda?: string | null
  opciones?: string[]
}

type DeclaracionApiResponse = {
  id: string
  token: string
  estado: string
  turno?: {
    id: string
    fecha_inicio: string
    cliente: string
    servicio: string
  } | null
  plantilla?: {
    id: string
    nombre: string
    descripcion?: string | null
    texto_intro: string
    campos: DeclaracionCampo[]
    requiere_firma: boolean
  } | null
  respuestas?: Record<string, string>
  firma_data_url?: string | null
  submitted_at?: string | null
  error?: string
}

const fetcher = async (url: string): Promise<DeclaracionApiResponse> => {
  const res = await fetch(url, { cache: "no-store" })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      estado: String(payload?.estado || "error"),
      token: "",
      id: "",
      error: payload?.error || "No se pudo cargar la declaración jurada.",
    }
  }
  return payload as DeclaracionApiResponse
}

const buildInitialValues = (campos: DeclaracionCampo[], respuestas?: Record<string, string>) => {
  const base: Record<string, string> = {}
  campos.forEach((campo) => {
    base[campo.id] = String(respuestas?.[campo.id] || "")
  })
  return base
}

export default function DeclaracionJuradaPage() {
  const params = useParams()
  const tokenParam = params.token
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam
  const { data, isLoading, mutate } = useSWR<DeclaracionApiResponse>(
    token ? `/api/declaraciones-juradas/${token}` : null,
    fetcher,
  )

  const campos = data?.plantilla?.campos || []
  const [values, setValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const signatureLarge = true
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLDivElement | null>(null)
  const hasSignatureRef = useRef(false)
  const drawingRef = useRef(false)
  const activePointerIdRef = useRef<number | null>(null)

  const resizeSignatureCanvas = () => {
    const canvas = canvasRef.current
    const wrap = canvasWrapRef.current
    if (!canvas || !wrap) return
    const ratio = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100)
    const isMobileViewport = window.innerWidth < 640
    const displayWidth = Math.max(280, Math.floor(wrap.clientWidth || 0))
    const displayHeight = signatureLarge ? (isMobileViewport ? 380 : 320) : isMobileViewport ? 270 : 200
    const prevSnapshot = hasSignatureRef.current ? canvas.toDataURL("image/png") : null

    canvas.width = Math.floor(displayWidth * ratio)
    canvas.height = Math.floor(displayHeight * ratio)
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`

    const context = canvas.getContext("2d")
    if (!context) return
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#111827"
    const baseLineWidth = isMobileViewport ? 3.6 : 3
    context.lineWidth = (signatureLarge ? baseLineWidth + 0.8 : baseLineWidth) * ratio

    if (prevSnapshot) {
      const image = new Image()
      image.onload = () => {
        context.clearRect(0, 0, canvas.width, canvas.height)
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
      }
      image.src = prevSnapshot
    }
  }

  useEffect(() => {
    if (!campos.length) return
    setValues(buildInitialValues(campos, data?.respuestas))
  }, [campos, data?.respuestas])

  useEffect(() => {
    hasSignatureRef.current = hasSignature
  }, [hasSignature])

  useEffect(() => {
    if (typeof window === "undefined") return
    resizeSignatureCanvas()
    const onResize = () => resizeSignatureCanvas()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (!canvasRef.current || !data?.firma_data_url) return
    const canvas = canvasRef.current
    const context = canvas.getContext("2d")
    if (!context) return
    const image = new Image()
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      setHasSignature(true)
    }
    image.src = data.firma_data_url
  }, [data?.firma_data_url])

  const statusVariant = useMemo(() => {
    if (data?.estado === "completada") return "success"
    if (data?.estado === "expirada" || data?.estado === "cancelada") return "danger"
    return "warning"
  }, [data?.estado])

  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    activePointerIdRef.current = event.pointerId
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    drawingRef.current = true
    context.beginPath()
    context.moveTo(x, y)
    setHasSignature(true)
  }

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = (event.clientX - rect.left) * scaleX
    const y = (event.clientY - rect.top) * scaleY
    context.lineTo(x, y)
    context.stroke()
  }

  const stopDraw = (event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (event && activePointerIdRef.current === event.pointerId) {
      const canvas = canvasRef.current
      if (canvas && canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
      activePointerIdRef.current = null
    }
    drawingRef.current = false
  }

  const clearSignature = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleSubmit = async () => {
    if (!token || !data?.plantilla) return
    setSubmitError(null)
    setSending(true)
    try {
      const firmaDataUrl =
        data.plantilla.requiere_firma && canvasRef.current && hasSignature ? canvasRef.current.toDataURL("image/png") : null

      const res = await fetch(`/api/declaraciones-juradas/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respuestas: values,
          firma_data_url: firmaDataUrl,
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setSubmitError(payload?.error || "No se pudo enviar la declaración jurada.")
        return
      }
      setSubmitted(true)
      mutate()
    } catch {
      setSubmitError("No se pudo enviar la declaración jurada.")
    } finally {
      setSending(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-10">
        <Card className="w-full max-w-2xl">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Cargando declaración jurada...</CardContent>
        </Card>
      </div>
    )
  }

  if (!data || data.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-10">
        <Card className="w-full max-w-2xl">
          <CardContent className="py-10 text-center text-sm text-destructive">
            {data?.error || "No se pudo cargar la declaración jurada."}
          </CardContent>
        </Card>
      </div>
    )
  }

  const readonly = data.estado !== "pendiente"

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4 py-8">
      <Card className="w-full max-w-3xl">
        <CardHeader className="space-y-3 border-b bg-muted/30">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>{data.plantilla?.nombre || "Declaración jurada"}</CardTitle>
            <Badge variant={statusVariant}>{data.estado || "pendiente"}</Badge>
          </div>
          {data.turno?.fecha_inicio && (
            <p className="text-sm text-muted-foreground">
              Turno: {formatDateTime(data.turno.fecha_inicio)} · {data.turno.cliente || "Clienta"} ·{" "}
              {data.turno.servicio || "Servicio"}
            </p>
          )}
          {data.plantilla?.texto_intro && <p className="text-sm text-foreground whitespace-pre-wrap">{data.plantilla.texto_intro}</p>}
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          {campos.map((campo) => (
            <div key={campo.id} className="space-y-1.5">
              <label className="text-sm font-medium">
                {campo.label}
                {campo.requerido && <span className="text-destructive"> *</span>}
              </label>

              {campo.tipo === "textarea" ? (
                <Textarea
                  value={values[campo.id] || ""}
                  onChange={(event) => setValues((prev) => ({ ...prev, [campo.id]: event.target.value }))}
                  placeholder={campo.placeholder || ""}
                  disabled={readonly}
                />
              ) : campo.tipo === "yes_no" ? (
                <Select
                  value={values[campo.id] || ""}
                  onValueChange={(value) => setValues((prev) => ({ ...prev, [campo.id]: value }))}
                  disabled={readonly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una opción" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="si">Sí</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              ) : campo.tipo === "select" ? (
                <Select
                  value={values[campo.id] || ""}
                  onValueChange={(value) => setValues((prev) => ({ ...prev, [campo.id]: value }))}
                  disabled={readonly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una opción" />
                  </SelectTrigger>
                  <SelectContent>
                    {(campo.opciones || []).map((option) => (
                      <SelectItem key={`${campo.id}-${option}`} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={campo.tipo === "number" ? "number" : campo.tipo === "date" ? "date" : "text"}
                  value={values[campo.id] || ""}
                  onChange={(event) => setValues((prev) => ({ ...prev, [campo.id]: event.target.value }))}
                  placeholder={campo.placeholder || ""}
                  disabled={readonly}
                />
              )}

              {campo.ayuda && <p className="text-xs text-muted-foreground">{campo.ayuda}</p>}
            </div>
          ))}

          {data.plantilla?.requiere_firma && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p id="firma-label" className="text-sm font-medium">
                  Firma
                  <span className="text-destructive"> *</span>
                </p>
              </div>
              <div ref={canvasWrapRef} className="rounded-md border bg-white p-2">
                <canvas
                  ref={canvasRef}
                  className="w-full rounded-sm bg-white touch-none"
                  style={{ touchAction: "none" }}
                  aria-labelledby="firma-label"
                  onPointerDown={readonly ? undefined : startDraw}
                  onPointerMove={readonly ? undefined : draw}
                  onPointerUp={readonly ? undefined : stopDraw}
                  onPointerCancel={readonly ? undefined : stopDraw}
                  onPointerLeave={readonly ? undefined : stopDraw}
                />
              </div>
              {!readonly && (
                <div className="flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={clearSignature}>
                    Limpiar firma
                  </Button>
                </div>
              )}
            </div>
          )}

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          {(submitted || data.estado === "completada") && (
            <p className="text-sm text-primary font-medium">Declaración enviada correctamente.</p>
          )}

          {!readonly && (
            <div className="flex justify-end">
              <Button type="button" onClick={handleSubmit} disabled={sending}>
                {sending ? "Enviando..." : "Enviar declaración jurada"}
              </Button>
            </div>
          )}

          <SicaipFooter />
        </CardContent>
      </Card>
    </div>
  )
}
