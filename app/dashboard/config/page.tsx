import { ConfigForm } from "@/components/config/config-form"

export default function DashboardConfigPage() {
  return (
    <div className="min-h-screen bg-background px-[var(--page-padding)] py-[var(--page-padding-lg)]">
      <div className="mx-auto max-w-[var(--container-max)] space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
          <p className="text-sm text-muted-foreground">Ajustes generales del sistema.</p>
        </div>
        <ConfigForm />
      </div>
    </div>
  )
}
