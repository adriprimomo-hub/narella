/**
 * EJEMPLO DE CLIENTE POSTGRESQL PARA NEXT.JS
 *
 * Este archivo muestra diferentes formas de conectarse y usar PostgreSQL
 * en tu aplicación Next.js.
 *
 * Puedes elegir entre:
 * 1. node-postgres (pg) - Queries manuales, máximo control
 * 2. Drizzle ORM - Type-safe, mejor DX
 *
 * Recomendación: Usar Drizzle para proyectos nuevos
 */

// ============================================
// OPCIÓN 1: node-postgres (pg)
// ============================================

import { Pool, QueryResult } from 'pg'

// Crear pool de conexiones
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // máximo 10 conexiones simultáneas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Función helper para queries
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now()
  const res = await pool.query<T>(text, params)
  const duration = Date.now() - start

  if (process.env.NODE_ENV === 'development') {
    console.log('[DB Query]', {
      text: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: res.rowCount,
    })
  }

  return res
}

// Función para transacciones
export async function transaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// ============================================
// EJEMPLOS DE USO CON node-postgres
// ============================================

/**
 * Ejemplo 1: Obtener todos los clientes
 */
export async function getClientes(usuarioId: string) {
  const result = await query(
    'SELECT * FROM clientes WHERE usuario_id = $1 ORDER BY created_at DESC',
    [usuarioId]
  )
  return result.rows
}

/**
 * Ejemplo 2: Crear un nuevo cliente
 */
export async function createCliente(data: {
  usuario_id: string
  nombre: string
  apellido: string
  telefono: string
  observaciones?: string
}) {
  const result = await query(
    `INSERT INTO clientes (usuario_id, nombre, apellido, telefono, observaciones)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.usuario_id, data.nombre, data.apellido, data.telefono, data.observaciones]
  )
  return result.rows[0]
}

/**
 * Ejemplo 3: Actualizar cliente
 */
export async function updateCliente(
  id: string,
  data: { nombre?: string; apellido?: string; telefono?: string; observaciones?: string }
) {
  const fields: string[] = []
  const values: any[] = []
  let paramCount = 1

  if (data.nombre !== undefined) {
    fields.push(`nombre = $${paramCount++}`)
    values.push(data.nombre)
  }
  if (data.apellido !== undefined) {
    fields.push(`apellido = $${paramCount++}`)
    values.push(data.apellido)
  }
  if (data.telefono !== undefined) {
    fields.push(`telefono = $${paramCount++}`)
    values.push(data.telefono)
  }
  if (data.observaciones !== undefined) {
    fields.push(`observaciones = $${paramCount++}`)
    values.push(data.observaciones)
  }

  fields.push(`updated_at = NOW()`)
  values.push(id)

  const result = await query(
    `UPDATE clientes SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  )
  return result.rows[0]
}

/**
 * Ejemplo 4: Eliminar cliente
 */
export async function deleteCliente(id: string) {
  const result = await query('DELETE FROM clientes WHERE id = $1 RETURNING *', [id])
  return result.rows[0]
}

/**
 * Ejemplo 5: Obtener turnos con relaciones (JOIN)
 */
export async function getTurnosConRelaciones(usuarioId: string, fecha?: Date) {
  let sql = `
    SELECT
      t.*,
      c.nombre as cliente_nombre,
      c.apellido as cliente_apellido,
      c.telefono as cliente_telefono,
      e.nombre as empleada_nombre,
      e.apellido as empleada_apellido,
      s.nombre as servicio_nombre,
      s.precio as servicio_precio
    FROM turnos t
    LEFT JOIN clientes c ON t.cliente_id = c.id
    LEFT JOIN empleadas e ON t.empleada_final_id = e.id
    LEFT JOIN servicios s ON t.servicio_final_id = s.id
    WHERE t.usuario_id = $1
  `

  const params: any[] = [usuarioId]

  if (fecha) {
    sql += ` AND t.fecha_inicio::date = $2`
    params.push(fecha)
  }

  sql += ` ORDER BY t.fecha_inicio ASC`

  const result = await query(sql, params)
  return result.rows
}

/**
 * Ejemplo 6: Crear pago con transacción
 */
export async function createPagoConTransaccion(data: {
  usuario_id: string
  turno_id: string
  monto: number
  metodo_pago: string
  sena_aplicada_id?: string
  monto_sena_aplicada?: number
  creado_por_username: string
}) {
  return await transaction(async (client) => {
    // 1. Crear pago
    const pagoResult = await client.query(
      `INSERT INTO pagos (
        usuario_id, turno_id, monto, metodo_pago, estado, fecha_pago,
        sena_aplicada_id, monto_sena_aplicada, creado_por_username
      )
      VALUES ($1, $2, $3, $4, 'completado', NOW(), $5, $6, $7)
      RETURNING *`,
      [
        data.usuario_id,
        data.turno_id,
        data.monto,
        data.metodo_pago,
        data.sena_aplicada_id,
        data.monto_sena_aplicada || 0,
        data.creado_por_username,
      ]
    )
    const pago = pagoResult.rows[0]

    // 2. Actualizar turno a completado
    await client.query(
      `UPDATE turnos
       SET estado = 'completado', finalizado_en = NOW()
       WHERE id = $1`,
      [data.turno_id]
    )

    // 3. Marcar seña como aplicada si existe
    if (data.sena_aplicada_id) {
      await client.query(
        `UPDATE senas
         SET estado = 'aplicada', aplicada_en = NOW(), aplicada_por = $1
         WHERE id = $2`,
        [data.usuario_id, data.sena_aplicada_id]
      )
    }

    // 4. Registrar movimiento de caja
    await client.query(
      `INSERT INTO caja_movimientos (
        usuario_id, medio_pago, tipo, monto, motivo,
        source_tipo, source_id, creado_por, creado_por_username
      )
      VALUES ($1, $2, 'ingreso', $3, $4, 'turno_pago', $5, $1, $6)`,
      [
        data.usuario_id,
        data.metodo_pago,
        data.monto,
        `Pago de turno`,
        pago.id,
        data.creado_por_username,
      ]
    )

    return pago
  })
}

/**
 * Ejemplo 7: Calcular liquidación de empleada
 */
export async function calcularLiquidacion(empleadaId: string, mes: Date) {
  const result = await query(
    `
    SELECT
      COUNT(t.id) as cantidad_turnos,
      SUM(calcular_comision_turno(
        t.servicio_final_id,
        t.empleada_final_id,
        p.monto
      )) as total_comisiones,
      COALESCE(
        (SELECT SUM(monto) FROM adelantos
         WHERE empleada_id = $1
         AND DATE_TRUNC('month', fecha_entrega) = DATE_TRUNC('month', $2::date)),
        0
      ) as total_adelantos
    FROM turnos t
    LEFT JOIN pagos p ON t.id = p.turno_id
    WHERE t.empleada_final_id = $1
      AND t.estado = 'completado'
      AND DATE_TRUNC('month', t.fecha_inicio) = DATE_TRUNC('month', $2::date)
    `,
    [empleadaId, mes]
  )

  const row = result.rows[0]
  return {
    cantidad_turnos: parseInt(row.cantidad_turnos || '0'),
    total_comisiones: parseFloat(row.total_comisiones || '0'),
    total_adelantos: parseFloat(row.total_adelantos || '0'),
    neto_a_pagar: parseFloat(row.total_comisiones || '0') - parseFloat(row.total_adelantos || '0'),
  }
}

/**
 * Ejemplo 8: Buscar clientes (text search)
 */
export async function buscarClientes(usuarioId: string, termino: string) {
  const result = await query(
    `
    SELECT * FROM clientes
    WHERE usuario_id = $1
      AND (
        LOWER(nombre) LIKE LOWER($2) OR
        LOWER(apellido) LIKE LOWER($2) OR
        telefono LIKE $2
      )
    ORDER BY nombre, apellido
    LIMIT 20
    `,
    [usuarioId, `%${termino}%`]
  )
  return result.rows
}

/**
 * Ejemplo 9: Obtener resumen de caja
 */
export async function getResumenCaja(usuarioId: string, fecha: Date) {
  const result = await query(
    `
    SELECT
      medio_pago,
      SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END) as total_ingresos,
      SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END) as total_egresos,
      SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END) as saldo
    FROM caja_movimientos
    WHERE usuario_id = $1
      AND created_at::date = $2::date
    GROUP BY medio_pago
    `,
    [usuarioId, fecha]
  )
  return result.rows
}

/**
 * Ejemplo 10: Verificar disponibilidad de turno
 */
export async function verificarDisponibilidad(
  empleadaId: string,
  fechaInicio: Date,
  fechaFin: Date,
  turnoIdExcluir?: string
) {
  let sql = `
    SELECT COUNT(*) as conflictos
    FROM turnos
    WHERE empleada_final_id = $1
      AND estado != 'cancelado'
      AND (
        (fecha_inicio < $3 AND fecha_fin > $2) OR
        (fecha_inicio >= $2 AND fecha_inicio < $3) OR
        (fecha_fin > $2 AND fecha_fin <= $3)
      )
  `

  const params: any[] = [empleadaId, fechaInicio, fechaFin]

  if (turnoIdExcluir) {
    sql += ` AND id != $4`
    params.push(turnoIdExcluir)
  }

  const result = await query(sql, params)
  return parseInt(result.rows[0].conflictos) === 0
}

// ============================================
// INTEGRACIÓN CON NEXT.JS API ROUTES
// ============================================

/**
 * Ejemplo de API Route: app/api/clientes/route.ts
 */
/*
import { NextRequest, NextResponse } from 'next/server'
import { getClientes, createCliente } from '@/database/example-client'
import { getUser } from '@/lib/auth' // tu función de auth

export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clientes = await getClientes(user.id)
    return NextResponse.json(clientes)
  } catch (error) {
    console.error('Error fetching clientes:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const cliente = await createCliente({
      usuario_id: user.id,
      nombre: body.nombre,
      apellido: body.apellido,
      telefono: body.telefono,
      observaciones: body.observaciones,
    })

    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    console.error('Error creating cliente:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
*/

// ============================================
// VALIDACIÓN Y SEGURIDAD
// ============================================

/**
 * Helper para verificar que un recurso pertenece al usuario
 */
export async function verificarOwnership(
  tabla: string,
  id: string,
  usuarioId: string
): Promise<boolean> {
  const result = await query(
    `SELECT COUNT(*) as count FROM ${tabla} WHERE id = $1 AND usuario_id = $2`,
    [id, usuarioId]
  )
  return parseInt(result.rows[0].count) === 1
}

/**
 * Helper para sanitizar input (prevenir SQL injection)
 * NOTA: Los parámetros ($1, $2, etc.) ya previenen SQL injection
 * Este es solo un ejemplo adicional
 */
export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '')
}

// ============================================
// CLEANUP
// ============================================

/**
 * Cerrar pool de conexiones al terminar
 * (útil para tests o scripts)
 */
export async function closePool() {
  await pool.end()
}

// ============================================
// EXPORT DEFAULT (para importar fácilmente)
// ============================================

const db = {
  query,
  transaction,
  getClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  getTurnosConRelaciones,
  createPagoConTransaccion,
  calcularLiquidacion,
  buscarClientes,
  getResumenCaja,
  verificarDisponibilidad,
  verificarOwnership,
  closePool,
}

export default db
