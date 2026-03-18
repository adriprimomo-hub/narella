import { describe, expect, it } from "vitest"
import { calcularLiquidacionDetalle } from "@/lib/liquidaciones/calculate"

describe("calcularLiquidacionDetalle", () => {
  it("combina pagos individuales y grupales, y calcula comisiones con overrides", () => {
    const liquidacion = calcularLiquidacionDetalle({
      desde: "2026-03-16T00:00:00.000Z",
      hasta: "2026-03-22T23:59:59.999Z",
      empleada: {
        id: "emp-1",
        nombre: "Ana",
        apellido: "Lopez",
      },
      pagos: [
        {
          turno_id: "turno-1",
          fecha_pago: "2026-03-16T10:00:00.000Z",
        },
      ],
      pagosGrupos: [
        {
          id: "pago-grupo-1",
          fecha_pago: "2026-03-16T12:00:00.000Z",
        },
      ],
      pagoGrupoItems: [
        {
          turno_id: "turno-1",
          pago_grupo_id: "pago-grupo-1",
        },
      ],
      turnos: [
        {
          id: "turno-1",
          empleada_id: "emp-1",
          empleada_final_id: "emp-1",
          servicio_id: "servicio-corte",
          servicio_final_id: "servicio-corte",
          servicios_agregados: [
            {
              servicio_id: "servicio-color",
              cantidad: 2,
              precio_unitario: 50,
              origen_staff: true,
              agregado_por_empleada_id: "emp-1",
            },
          ],
        },
      ],
      servicios: [
        {
          id: "servicio-corte",
          nombre: "Corte",
          precio: 100,
          precio_lista: 100,
          precio_descuento: 100,
          comision_pct: 10,
          comision_monto_fijo: 5,
        },
        {
          id: "servicio-color",
          nombre: "Color",
          precio: 50,
          precio_lista: 50,
          precio_descuento: 50,
          comision_pct: 20,
          comision_monto_fijo: 2,
        },
      ],
      overrides: [
        {
          servicio_id: "servicio-color",
          empleada_id: "emp-1",
          comision_pct: 50,
          comision_monto_fijo: 1,
        },
      ],
      overridesProductos: [
        {
          producto_id: "producto-shampoo",
          empleada_id: "emp-1",
          comision_pct: 15,
          comision_monto_fijo: 0,
        },
      ],
      adelantos: [
        {
          id: "adelanto-1",
          monto: 10,
          empleada_id: "emp-1",
          fecha_entrega: "2026-03-16T08:00:00.000Z",
        },
      ],
      ventasProductos: [
        {
          id: "venta-1",
          cantidad: 1,
          precio_unitario: 30,
          empleada_id: "emp-1",
          producto_id: "producto-shampoo",
          created_at: "2026-03-16T09:00:00.000Z",
          nota: "Venta |comision_staff=1|staff_empleada_id=emp-1",
          productos: {
            id: "producto-shampoo",
            nombre: "Shampoo",
            precio_lista: 30,
            precio_descuento: 30,
            comision_pct: 15,
            comision_monto_fijo: 0,
          },
        },
      ],
    })

    expect(liquidacion.desde).toBe("2026-03-16T00:00:00.000Z")
    expect(liquidacion.hasta).toBe("2026-03-22T23:59:59.999Z")
    expect(liquidacion.items).toHaveLength(4)
    expect(liquidacion.items[0]).toMatchObject({
      id: "servicio-principal-turno-1-0",
      tipo: "servicio",
      fecha: "2026-03-16T12:00:00.000Z",
      servicio: "Corte",
      comision: 15,
    })
    expect(liquidacion.items[1]).toMatchObject({
      id: "servicio-extra-turno-turno-1-0",
      tipo: "servicio",
      fecha: "2026-03-16T12:00:00.000Z",
      servicio: "Color x2",
      comision: 52,
    })
    expect(liquidacion.items[2]).toMatchObject({
      id: "producto-venta-1",
      tipo: "producto",
      fecha: "2026-03-16T09:00:00.000Z",
      producto: "Shampoo",
      comision: 4.5,
    })
    expect(liquidacion.items[3]).toMatchObject({
      id: "adelanto-adelanto-1",
      tipo: "adelanto",
      fecha: "2026-03-16T08:00:00.000Z",
      adelanto: -10,
    })
    expect(liquidacion.totales).toEqual({
      comision: 71.5,
      adelantos: 10,
      neto: 61.5,
    })
  })
})
