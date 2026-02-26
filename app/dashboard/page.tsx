"use client"

import { TurnosGrid } from "@/components/turnos/turnos-grid"
import { ClientesList } from "@/components/clientes/clientes-list"
import { ServiciosList } from "@/components/servicios/servicios-list"
import { ReportesServicios } from "@/components/reportes/reportes-servicios"
import { ConfigForm } from "@/components/config/config-form"
import { EmpleadasPanel } from "@/components/empleadas/empleadas-panel"
import { FinanzasPanel } from "@/components/finanzas/finanzas-panel"
import { FacturasPanel } from "@/components/facturacion/facturas-panel"
import { GiftcardsPanel } from "@/components/giftcards/giftcards-panel"
import { InsumosPanel } from "@/components/inventario/insumos-panel"
import { ProductosPanel } from "@/components/productos/productos-panel"
import { CajaPanel } from "@/components/caja/caja-panel"
import { StaffTurnosPanel } from "@/components/staff/staff-turnos-panel"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { normalizeRole } from "@/lib/roles"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type FetchError = Error & { status?: number }

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" })
  const payload = await res.json().catch(() => ({}))

  if (!res.ok) {
    const error = new Error(payload?.error || `HTTP ${res.status}`) as FetchError
    error.status = res.status
    throw error
  }

  return payload
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background px-[var(--page-padding)] py-[var(--page-padding-lg)]">
          <div className="mx-auto max-w-[var(--container-max)] text-sm text-muted-foreground">Cargando tablero...</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: config, error: configError, isLoading: configLoading } = useSWR<{ rol?: string }, FetchError>(
    "/api/config",
    fetcher,
  )
  const role = normalizeRole(config?.rol)
  const isAdmin = role === "admin"
  const isStaff = role === "staff"
  const isRecepcion = role === "recepcion"
  const isCaja = role === "caja"
  const allowedTabs = useMemo(
    () => {
      if (isAdmin) {
        return new Set([
          "turnos",
          "clientes",
          "servicios",
          "giftcards",
          "reportes",
          "facturas",
          "personal",
          "finanzas",
          "inventario",
          "productos",
          "caja",
          "config",
        ])
      }
      if (isStaff) {
        return new Set(["turnos"])
      }
      if (isRecepcion) {
        return new Set(["turnos", "clientes", "servicios", "giftcards", "personal", "inventario", "productos", "caja", "finanzas", "facturas"])
      }
      if (isCaja) {
        return new Set(["turnos", "clientes", "servicios", "giftcards", "personal", "inventario", "productos", "caja"])
      }
      return new Set(["turnos"])
    },
    [isAdmin, isStaff, isRecepcion, isCaja],
  )
  const searchTab = searchParams.get("tab") || ""
  const initialTab = allowedTabs.has(searchTab) ? searchTab : "turnos"
  const [tab, setTab] = useState<string>(initialTab)

  const tabsConfig = useMemo(
    () => [
      { key: "turnos", label: "Turnos" },
      { key: "caja", label: "Caja" },
      { key: "finanzas", label: "Finanzas" },
      { key: "reportes", label: "Reportes" },
      { key: "facturas", label: "Facturas" },
      { key: "servicios", label: "Servicios" },
      { key: "giftcards", label: "Gift Cards" },
      { key: "clientes", label: "Clientes" },
      { key: "personal", label: "Personal" },
      { key: "productos", label: "Productos" },
      { key: "inventario", label: "Insumos" },
    ],
    [],
  )
  const availableTabs = useMemo(() => tabsConfig.filter((item) => allowedTabs.has(item.key)), [tabsConfig, allowedTabs])

  useEffect(() => {
    const current = searchParams.get("tab") || ""
    const nextValue = allowedTabs.has(current) ? current : "turnos"
    if (nextValue !== tab) {
      setTab(nextValue)
    }
  }, [allowedTabs, searchParams, tab])

  const handleTabChange = (value: string) => {
    setTab(value)
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    router.replace(`/dashboard?${params.toString()}`, { scroll: false })
  }

  if (configLoading && !config) {
    return (
      <div className="min-h-screen bg-background px-[var(--page-padding)] py-[var(--page-padding-lg)]">
        <div className="mx-auto max-w-[var(--container-max)] text-sm text-muted-foreground">Cargando permisos...</div>
      </div>
    )
  }

  if (configError) {
    return (
      <div className="min-h-screen bg-background px-[var(--page-padding)] py-[var(--page-padding-lg)]">
        <div className="mx-auto max-w-[var(--container-max)] space-y-2 text-sm">
          <p className="text-destructive">
            {configError.status === 401 ? "Tu sesión no es válida o expiró." : "No se pudo cargar tu perfil de permisos."}
          </p>
          {configError.status === 401 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.assign("/auth/login")}>
              Ir a login
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-[var(--page-padding)] py-[var(--page-padding-lg)]">
      <div className="mx-auto max-w-[var(--container-max)]">

        <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
          <div className="w-full max-w-sm">
            <p className="mb-1 text-xs text-muted-foreground">Sección</p>
            <Select value={tab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecciona una sección" />
              </SelectTrigger>
              <SelectContent>
                {availableTabs.map((item) => (
                  <SelectItem key={item.key} value={item.key}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {allowedTabs.has("turnos") && (
            <TabsContent value="turnos" className="mt-6">
              {isStaff ? <StaffTurnosPanel /> : <TurnosGrid />}
            </TabsContent>
          )}

          {allowedTabs.has("clientes") && (
            <TabsContent value="clientes" className="mt-6">
              <ClientesList />
            </TabsContent>
          )}

          {allowedTabs.has("servicios") && (
            <TabsContent value="servicios" className="mt-6">
              <ServiciosList />
            </TabsContent>
          )}

          {allowedTabs.has("giftcards") && (
            <TabsContent value="giftcards" className="mt-6">
              <GiftcardsPanel />
            </TabsContent>
          )}

          {allowedTabs.has("personal") && (
            <TabsContent value="personal" className="mt-6">
              <EmpleadasPanel />
            </TabsContent>
          )}

          {allowedTabs.has("inventario") && (
            <TabsContent value="inventario" className="mt-6">
              <InsumosPanel />
            </TabsContent>
          )}

          {allowedTabs.has("productos") && (
            <TabsContent value="productos" className="mt-6">
              <ProductosPanel />
            </TabsContent>
          )}

          {allowedTabs.has("caja") && (
            <TabsContent value="caja" className="mt-6">
              <CajaPanel />
            </TabsContent>
          )}

          {allowedTabs.has("finanzas") && (
            <TabsContent value="finanzas" className="mt-6">
              <FinanzasPanel />
            </TabsContent>
          )}

          {allowedTabs.has("reportes") && (
            <TabsContent value="reportes" className="mt-6">
              <ReportesServicios />
            </TabsContent>
          )}

          {allowedTabs.has("facturas") && (
            <TabsContent value="facturas" className="mt-6">
              <FacturasPanel />
            </TabsContent>
          )}

          {allowedTabs.has("config") && (
            <TabsContent value="config" className="mt-6">
              <ConfigForm />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  )
}

