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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/components/ui/use-mobile"
import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR from "swr"
import { ChevronDownIcon } from "lucide-react"
import { normalizeRole } from "@/lib/roles"

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
  const isMobile = useIsMobile()
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
      { key: "turnos", label: "Turnos", category: "turnos" },
      { key: "caja", label: "Caja", category: "administracion" },
      { key: "finanzas", label: "Finanzas", category: "administracion" },
      { key: "reportes", label: "Reportes", category: "administracion" },
      { key: "facturas", label: "Facturas", category: "administracion" },
      { key: "servicios", label: "Servicios", category: "gestion" },
      { key: "giftcards", label: "Gift Cards", category: "gestion" },
      { key: "clientes", label: "Clientes", category: "gestion" },
      { key: "personal", label: "Personal", category: "gestion" },
      { key: "productos", label: "Productos", category: "inventario" },
      { key: "inventario", label: "Insumos", category: "inventario" },
    ],
    [],
  )
  const primaryTabKeys = useMemo(
    () => (isMobile ? new Set(["turnos"]) : new Set(["turnos"])),
    [isMobile],
  )
  const availableTabs = useMemo(() => tabsConfig.filter((item) => allowedTabs.has(item.key)), [tabsConfig, allowedTabs])
  const primaryTabs = useMemo(() => availableTabs.filter((item) => primaryTabKeys.has(item.key)), [availableTabs, primaryTabKeys])
  const secondaryTabs = useMemo(() => availableTabs.filter((item) => !primaryTabKeys.has(item.key)), [availableTabs, primaryTabKeys])
  const moreActive = secondaryTabs.some((item) => item.key === tab)

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
          <TabsList className="flex w-full flex-wrap items-center justify-start gap-2 h-auto">
            {primaryTabs.map((item) => (
              <TabsTrigger key={item.key} value={item.key} className="sm:flex-none">
                {item.label}
              </TabsTrigger>
            ))}

            {/* Administración */}
            {secondaryTabs.some((t) => t.category === "administracion") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={secondaryTabs.some((t) => t.category === "administracion" && t.key === tab) ? "secondary" : "outline"}
                    className="gap-1.5"
                  >
                    Administración
                    <ChevronDownIcon className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {secondaryTabs
                    .filter((t) => t.category === "administracion")
                    .map((item) => (
                      <DropdownMenuItem
                        key={item.key}
                        onSelect={() => handleTabChange(item.key)}
                        className={item.key === tab ? "font-medium" : undefined}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Gestión */}
            {secondaryTabs.some((t) => t.category === "gestion") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={secondaryTabs.some((t) => t.category === "gestion" && t.key === tab) ? "secondary" : "outline"}
                    className="gap-1.5"
                  >
                    Gestión
                    <ChevronDownIcon className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {secondaryTabs
                    .filter((t) => t.category === "gestion")
                    .map((item) => (
                      <DropdownMenuItem
                        key={item.key}
                        onSelect={() => handleTabChange(item.key)}
                        className={item.key === tab ? "font-medium" : undefined}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Inventario */}
            {secondaryTabs.some((t) => t.category === "inventario") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={secondaryTabs.some((t) => t.category === "inventario" && t.key === tab) ? "secondary" : "outline"}
                    className="gap-1.5"
                  >
                    Inventario
                    <ChevronDownIcon className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  {secondaryTabs
                    .filter((t) => t.category === "inventario")
                    .map((item) => (
                      <DropdownMenuItem
                        key={item.key}
                        onSelect={() => handleTabChange(item.key)}
                        className={item.key === tab ? "font-medium" : undefined}
                      >
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </TabsList>

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

