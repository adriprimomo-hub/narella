import { createClient } from "@/lib/localdb/server"
import { getTenantId } from "@/lib/localdb/session"
import { NextResponse } from "next/server"
import { getUserRole } from "@/lib/permissions"
import { isAdminRole } from "@/lib/roles"
import {
  cargarLiquidacionDetalle,
  LiquidacionServiceError,
} from "@/lib/liquidaciones/server"
import type { LiquidacionDetalle } from "@/lib/liquidaciones/calculate"

const isMissingTableError = (error: any) => {
  const code = String(error?.code || "")
  return code === "42P01" || code === "PGRST205"
}

const toServiceErrorResponse = (error: LiquidacionServiceError) =>
  NextResponse.json({ error: error.message || "No se pudo calcular la liquidación." }, { status: error.status || 500 })

export async function GET(request: Request) {
  try {
    const db = await createClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const role = await getUserRole(db, user.id)
    if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const tenantId = getTenantId(user)

    const url = new URL(request.url)
    const liquidacion = await cargarLiquidacionDetalle({
      db,
      tenantId,
      empleadaId: url.searchParams.get("empleada_id") || "",
      desde: url.searchParams.get("desde"),
      hasta: url.searchParams.get("hasta"),
    })

    return NextResponse.json(liquidacion)
  } catch (error) {
    if (error instanceof LiquidacionServiceError) {
      return toServiceErrorResponse(error)
    }
    console.error("[liquidaciones] unexpected error", error)
    return NextResponse.json({ error: "No se pudo calcular la liquidacion" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const db = await createClient()
    const {
      data: { user },
    } = await db.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const role = await getUserRole(db, user.id)
    if (!isAdminRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const tenantId = getTenantId(user)

    const payload = await request.json().catch(() => null)
    const empleadaId = String(payload?.empleada_id || "").trim()
    const desde = String(payload?.desde || "").trim()
    const hasta = String(payload?.hasta || "").trim()

    if (!empleadaId) {
      return NextResponse.json({ error: "Selecciona una empleada" }, { status: 400 })
    }

    const liquidacion = (await cargarLiquidacionDetalle({
      db,
      tenantId,
      empleadaId,
      desde,
      hasta,
    })) as LiquidacionDetalle

    const insertPayload = {
      usuario_id: tenantId,
      empleada_id: liquidacion.empleada.id,
      empleada_nombre: liquidacion.empleada.nombre || "Sin asignar",
      empleada_apellido: liquidacion.empleada.apellido || null,
      desde: liquidacion.desde,
      hasta: liquidacion.hasta,
      items: Array.isArray(liquidacion.items) ? liquidacion.items : [],
      total_comision: Number(liquidacion.totales?.comision || 0),
      total_adelantos: Number(liquidacion.totales?.adelantos || 0),
      total_neto: Number(liquidacion.totales?.neto || 0),
      created_by: user.id,
    }

    const { data: saved, error: saveError } = await db
      .from("liquidaciones_historial")
      .insert([insertPayload])
      .select("id, created_at")
      .single()

    if (saveError) {
      if (isMissingTableError(saveError)) {
        return NextResponse.json({ error: "Falta crear la tabla de historial de liquidaciones." }, { status: 500 })
      }
      return NextResponse.json({ error: saveError.message || "No se pudo guardar la liquidación." }, { status: 500 })
    }

    return NextResponse.json({
      ...liquidacion,
      historial_id: saved?.id || null,
      created_at: saved?.created_at || new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof LiquidacionServiceError) {
      return toServiceErrorResponse(error)
    }
    console.error("[liquidaciones] unexpected POST error", error)
    return NextResponse.json({ error: "No se pudo guardar la liquidación" }, { status: 500 })
  }
}
