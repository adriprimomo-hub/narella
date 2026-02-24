// @ts-nocheck
import { randomUUID } from "crypto"
import { hydrateLocalDb, persistLocalDb } from "./persist"
import { hashPasswordSync, isPasswordHashed } from "@/lib/auth/password"

type HorarioLocal = { dia: number; desde: string; hasta: string; activo: boolean }

export type LocalUser = {
  id: string
  username: string
  rol: "admin" | "recepcion" | "staff" | "caja" | "solo_turnos"
  password?: string
  tenant_id?: string
  empleada_id?: string | null
  facturacion_activa?: boolean
  afip_cuit?: string | null
  afip_punto_venta?: number | null
  afip_cbte_tipo?: number | null
  afip_produccion?: boolean
  afip_cert?: string | null
  afip_key?: string | null
  afip_access_token?: string | null
  afip_iva_id?: number | null
  afip_iva_porcentaje?: number | null
  factura_logo_url?: string | null
  factura_leyenda?: string | null
  factura_leyenda_footer?: string | null
  factura_emisor_nombre?: string | null
  factura_emisor_domicilio?: string | null
  factura_emisor_telefono?: string | null
  factura_emisor_email?: string | null
  created_at?: string
  updated_at?: string
}

export type EmpleadaAusencia = {
  id: string
  usuario_id: string
  empleada_id: string
  fecha_desde: string
  fecha_hasta: string
  hora_desde?: string | null // Formato "HH:mm", null = día completo
  hora_hasta?: string | null // Formato "HH:mm", null = día completo
  motivo: "vacaciones" | "licencia" | "enfermedad" | "otro"
  descripcion?: string | null
  created_at: string
  updated_at?: string
}

export type Sena = {
  id: string
  usuario_id: string
  cliente_id: string
  servicio_id?: string | null // Servicio al que aplica la seña
  turno_id?: string | null
  monto: number
  metodo_pago: string
  estado: "pendiente" | "aplicada" | "devuelta"
  nota?: string | null
  fecha_pago: string
  creado_por_username: string
  created_at: string
  updated_at?: string
}

export type GiftCard = {
  id: string
  usuario_id: string
  numero: string
  cliente_id: string
  servicio_ids: string[]
  valido_por_dias: number
  valido_hasta?: string | null
  de_parte_de?: string | null
  monto_total: number
  metodo_pago: string
  facturado?: boolean | null
  estado?: "vigente" | "usada" | "anulada"
  usada_en?: string | null
  usada_en_turno_id?: string | null
  imagen_base64?: string | null
  imagen_storage_bucket?: string | null
  imagen_storage_path?: string | null
  creado_por?: string | null
  creado_por_username?: string | null
  created_at?: string
  updated_at?: string
}

export type ProductoEmpleadaComision = {
  usuario_id: string
  producto_id: string
  empleada_id: string
  comision_pct?: number | null
  comision_monto_fijo?: number | null
}

type FacturaItemSnapshot = {
  descripcion: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  tipo: "servicio" | "producto" | "penalidad" | "ajuste"
}

export type FacturaRegistro = {
  id: string
  usuario_id: string
  tipo: "factura" | "nota_credito"
  estado: "emitida" | "con_nota_credito" | "anulada"
  factura_relacionada_id?: string | null
  nota_credito_id?: string | null
  numero?: number | null
  punto_venta?: number | null
  cbte_tipo?: number | null
  cae?: string | null
  cae_vto?: string | null
  fecha?: string | null
  total: number
  metodo_pago?: string | null
  cliente_id?: string | null
  cliente_nombre?: string | null
  cliente_apellido?: string | null
  items?: FacturaItemSnapshot[]
  descuento_sena?: number | null
  pdf_base64?: string | null
  pdf_storage_bucket?: string | null
  pdf_storage_path?: string | null
  pdf_filename?: string | null
  origen_tipo?: string | null
  origen_id?: string | null
  nota?: string | null
  creado_por?: string | null
  creado_por_username?: string | null
  created_at?: string
  updated_at?: string
}

export type ShareLink = {
  id: string
  usuario_id: string
  token: string
  tipo: "factura" | "giftcard" | "liquidacion"
  resource_id?: string | null
  filename?: string | null
  mime_type?: string | null
  data_base64?: string | null
  data_storage_bucket?: string | null
  data_storage_path?: string | null
  created_at?: string
  expires_at?: string | null
}

type ConfiguracionLocal = {
  id: string
  usuario_id: string
  horario_local?: HorarioLocal[]
  nombre_local?: string | null
  direccion?: string | null
  telefono?: string | null
  created_at?: string
  updated_at?: string
}

const iso = (date: Date) => date.toISOString()
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60000)

const LOCAL_USER_ID = "local-user"
const LOCAL_USER_USERNAME = "admin"

const todayBase = new Date()
todayBase.setHours(9, 0, 0, 0)

const horarioLocal: HorarioLocal[] = [
  { dia: 0, desde: "", hasta: "", activo: false },
  { dia: 1, desde: "09:00", hasta: "19:00", activo: true },
  { dia: 2, desde: "09:00", hasta: "19:00", activo: true },
  { dia: 3, desde: "09:00", hasta: "19:00", activo: true },
  { dia: 4, desde: "09:00", hasta: "19:00", activo: true },
  { dia: 5, desde: "09:00", hasta: "19:00", activo: true },
  { dia: 6, desde: "10:00", hasta: "14:00", activo: true },
]

const categoriaCorteId = "categoria-corte"
const categoriaTratamientoId = "categoria-tratamiento"

const servicioCorteId = "servicio-corte"
const servicioColorId = "servicio-color"
const servicioExtraId = "servicio-extra"

const clienteSofiaId = "cliente-sofia"
const clienteLuciaId = "cliente-lucia"

const empleadaAnaId = "empleada-ana"
const empleadaBelenId = "empleada-belen"

const turnoMananaId = "turno-manana"
const turnoTardeId = "turno-tarde"

const productoShampooId = "producto-shampoo"
const insumoGuantesId = "insumo-guantes"

const nowIso = iso(new Date())

export const db: any = {
  categorias: [
    {
      id: categoriaCorteId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Corte",
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: categoriaTratamientoId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Tratamientos",
      created_at: nowIso,
      updated_at: nowIso,
    },
  ],
  recursos: [],
  usuarios: [
    {
      id: LOCAL_USER_ID,
      username: LOCAL_USER_USERNAME,
      rol: "admin",
      password: hashPasswordSync("admin"),
      tenant_id: LOCAL_USER_ID,
      facturacion_activa: false,
      afip_punto_venta: 1,
      afip_cbte_tipo: 11,
      afip_produccion: false,
      afip_iva_id: null,
      afip_iva_porcentaje: null,
      created_at: nowIso,
      updated_at: nowIso,
    } satisfies LocalUser,
    {
      id: "staff-ana",
      username: "ana",
      rol: "staff",
      password: hashPasswordSync("ana"),
      tenant_id: LOCAL_USER_ID,
      empleada_id: empleadaAnaId,
      created_at: nowIso,
      updated_at: nowIso,
    } satisfies LocalUser,
  ],
  configuracion: [
    {
      id: "config-local-user",
      usuario_id: LOCAL_USER_ID,
      horario_local: horarioLocal,
      created_at: nowIso,
      updated_at: nowIso,
    } satisfies ConfiguracionLocal,
  ],
  metodos_pago_config: [
    { nombre: "efectivo", activo: true, created_at: nowIso },
    { nombre: "tarjeta", activo: true, created_at: nowIso },
    { nombre: "transferencia", activo: true, created_at: nowIso },
  ],
  clientes: [
    {
      id: clienteSofiaId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Sofia",
      apellido: "Perez",
      telefono: "1112345678",
      observaciones: "Prefiere horario temprano",
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: clienteLuciaId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Lucia",
      apellido: "Gomez",
      telefono: "1198765432",
      observaciones: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ],
  empleadas: [
    {
      id: empleadaAnaId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Ana",
      apellido: "Lopez",
      telefono: "1122334455",
      activo: true,
      horarios: [
        { dia: 1, desde: "09:00", hasta: "17:00" },
        { dia: 2, desde: "09:00", hasta: "17:00" },
        { dia: 3, desde: "09:00", hasta: "17:00" },
        { dia: 4, desde: "09:00", hasta: "17:00" },
        { dia: 5, desde: "09:00", hasta: "17:00" },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: empleadaBelenId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Belen",
      apellido: "Gomez",
      telefono: "1100112233",
      activo: true,
      horarios: [
        { dia: 2, desde: "10:00", hasta: "18:00" },
        { dia: 3, desde: "10:00", hasta: "18:00" },
        { dia: 4, desde: "10:00", hasta: "18:00" },
        { dia: 5, desde: "10:00", hasta: "18:00" },
        { dia: 6, desde: "10:00", hasta: "14:00" },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    },
  ],
  servicios: [
    {
      id: servicioCorteId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Corte y styling",
      precio_lista: 1200,
      precio_descuento: 1000,
      duracion_minutos: 60,
      activo: true,
      categoria_id: categoriaCorteId,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: servicioColorId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Color completo",
      precio_lista: 3200,
      precio_descuento: 2800,
      duracion_minutos: 90,
      activo: true,
      categoria_id: categoriaTratamientoId,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: servicioExtraId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Extra diseno",
      precio_lista: 500,
      precio_descuento: null,
      duracion_minutos: 15,
      activo: true,
      categoria_id: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ],
  turnos: [
    {
      id: turnoMananaId,
      usuario_id: LOCAL_USER_ID,
      cliente_id: clienteSofiaId,
      servicio_id: servicioCorteId,
      servicio_final_id: servicioCorteId,
      empleada_id: empleadaAnaId,
      empleada_final_id: empleadaAnaId,
      empleada_final_nombre: "Ana",
      empleada_final_apellido: "Lopez",
      fecha_inicio: iso(new Date(todayBase.getTime() + 60 * 60000)),
      fecha_fin: iso(addMinutes(new Date(todayBase.getTime() + 60 * 60000), 60)),
      duracion_minutos: 60,
      estado: "pendiente",
      asistio: null,
      observaciones: "Trae referencia",
      confirmacion_estado: "no_enviada",
      servicios_agregados: [],
      productos_agregados: [],
      foto_trabajo_base64: null,
      foto_trabajo_storage_bucket: null,
      foto_trabajo_storage_path: null,
      foto_trabajo_mime_type: null,
      creado_por: LOCAL_USER_ID,
      creado_por_username: LOCAL_USER_USERNAME,
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      id: turnoTardeId,
      usuario_id: LOCAL_USER_ID,
      cliente_id: clienteLuciaId,
      servicio_id: servicioColorId,
      servicio_final_id: servicioColorId,
      empleada_id: empleadaBelenId,
      empleada_final_id: empleadaBelenId,
      empleada_final_nombre: "Belen",
      empleada_final_apellido: "Gomez",
      fecha_inicio: iso(new Date(todayBase.getTime() + 180 * 60000)),
      fecha_fin: iso(addMinutes(new Date(todayBase.getTime() + 180 * 60000), 90)),
      duracion_minutos: 90,
      estado: "en_curso",
      asistio: true,
      observaciones: null,
      confirmacion_estado: "confirmado",
      servicios_agregados: [],
      productos_agregados: [],
      foto_trabajo_base64: null,
      foto_trabajo_storage_bucket: null,
      foto_trabajo_storage_path: null,
      foto_trabajo_mime_type: null,
      iniciado_en: nowIso,
      iniciado_por: LOCAL_USER_ID,
      creado_por: LOCAL_USER_ID,
      creado_por_username: LOCAL_USER_USERNAME,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ],
  turno_grupos: [],
  senas: [
    {
      id: "sena-sofia",
      usuario_id: LOCAL_USER_ID,
      cliente_id: clienteSofiaId,
      servicio_id: servicioColorId, // Seña vinculada al servicio de color
      monto: 500,
      metodo_pago: "efectivo",
      estado: "pendiente",
      nota: "Reserva para color",
      fecha_pago: nowIso,
      creado_por_username: LOCAL_USER_USERNAME,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ] as Sena[],
  adelantos: [],
  pagos: [],
  pagos_grupos: [],
  pago_grupo_items: [],
  giftcards: [] as GiftCard[],
  caja_movimientos: [
    {
      id: "caja-inicial",
      usuario_id: LOCAL_USER_ID,
      medio_pago: "efectivo",
      tipo: "ingreso",
      monto: 1200,
      motivo: "Caja inicial",
      created_at: nowIso,
      creado_por: LOCAL_USER_ID,
      creado_por_username: LOCAL_USER_USERNAME,
    },
  ],
  insumos: [
    {
      id: insumoGuantesId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Guantes descartables",
      stock_actual: 50,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ],
  insumo_movimientos: [],
  productos: [
    {
      id: productoShampooId,
      usuario_id: LOCAL_USER_ID,
      nombre: "Shampoo brillo",
      stock_actual: 12,
      precio_lista: 1500,
      precio_descuento: 1400,
      comision_pct: 10, // 10% de comisión
      comision_monto_fijo: null,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ],
  producto_movimientos: [],
  producto_compras: [],
  facturas: [] as FacturaRegistro[],
  servicio_empleada_comisiones: [],
  producto_empleada_comisiones: [] as ProductoEmpleadaComision[],
  recordatorios: [],
  confirmation_tokens: [],
  share_links: [] as ShareLink[],
  empleada_ausencias: [] as EmpleadaAusencia[],
}

hydrateLocalDb(db)

const normalizeTenantIds = () => {
  if (!Array.isArray(db.usuarios) || db.usuarios.length === 0) return
  const adminUser = db.usuarios.find((user) => user.rol === "admin") || db.usuarios[0]
  if (!adminUser) return

  let changed = false
  db.usuarios.forEach((user) => {
    if (!user.tenant_id || user.tenant_id === "narella") {
      const nextTenantId = user.rol === "admin" ? user.id : adminUser.id
      if (user.tenant_id !== nextTenantId) {
        user.tenant_id = nextTenantId
        changed = true
      }
    }
  })

  if (changed) {
    persistLocalDb(db as any)
  }
}

normalizeTenantIds()

const normalizeUserPasswords = () => {
  if (!Array.isArray(db.usuarios) || db.usuarios.length === 0) return
  let changed = false
  db.usuarios.forEach((user: any) => {
    if (!user.password) return
    if (!isPasswordHashed(user.password)) {
      user.password = hashPasswordSync(String(user.password))
      changed = true
    }
  })
  if (changed) {
    persistLocalDb(db as any)
  }
}

normalizeUserPasswords()

const migrateCreadoPorUsername = () => {
  let changed = false
  const tables = [
    "turnos",
    "senas",
    "giftcards",
    "pagos",
    "pagos_grupos",
    "adelantos",
    "productos",
    "producto_movimientos",
    "producto_compras",
    "insumos",
    "insumo_movimientos",
    "caja_movimientos",
    "facturas",
  ]

  tables.forEach((table) => {
    const rows = (db as any)[table]
    if (!Array.isArray(rows)) return
    rows.forEach((row: any) => {
      if (!row) return
      if (row.creado_por_email && !row.creado_por_username) {
        const raw = String(row.creado_por_email)
        row.creado_por_username = raw.split("@")[0] || raw
        delete row.creado_por_email
        changed = true
        return
      }
      if (row.creado_por_email) {
        delete row.creado_por_email
        changed = true
      }
    })
  })

  if (Array.isArray(db.usuarios)) {
    db.usuarios.forEach((user: any) => {
      if (!user.username && user.email) {
        const raw = String(user.email)
        user.username = raw.split("@")[0] || raw
        changed = true
      }
      if ("email" in user) {
        delete user.email
        changed = true
      }
    })
  }

  if (changed) {
    persistLocalDb(db as any)
  }
}

migrateCreadoPorUsername()

const normalizeEmpleadasApellido = () => {
  if (!Array.isArray(db.empleadas) || db.empleadas.length === 0) return
  let changed = false
  db.empleadas.forEach((empleada: any) => {
    if (!("apellido" in empleada)) {
      empleada.apellido = ""
      changed = true
    }
  })
  if (changed) {
    persistLocalDb(db as any)
  }
}

normalizeEmpleadasApellido()

const ensureGiftcardsTable = () => {
  if (!("giftcards" in db)) {
    ;(db as any).giftcards = []
    persistLocalDb(db as any)
    return
  }
  if (!Array.isArray((db as any).giftcards)) {
    ;(db as any).giftcards = []
    persistLocalDb(db as any)
  }
}

ensureGiftcardsTable()

const ensureShareLinksTable = () => {
  if (!("share_links" in db)) {
    ;(db as any).share_links = []
    persistLocalDb(db as any)
    return
  }
  if (!Array.isArray((db as any).share_links)) {
    ;(db as any).share_links = []
    persistLocalDb(db as any)
  }
}

ensureShareLinksTable()

const ensureConfiguracionTable = () => {
  if (!("configuracion" in db) || !Array.isArray((db as any).configuracion)) {
    ;(db as any).configuracion = []
  }

  let changed = false
  const configs = (db as any).configuracion as any[]

  const ensureConfigForTenant = (tenantId: string, horario?: HorarioLocal[] | null) => {
    if (!tenantId) return
    const existing = configs.find((row: any) => row?.usuario_id === tenantId)
    if (existing) {
      if (!Array.isArray(existing.horario_local) && Array.isArray(horario)) {
        existing.horario_local = horario
        changed = true
      }
      return
    }
    configs.push({
      id: randomUUID(),
      usuario_id: tenantId,
      horario_local: Array.isArray(horario) ? horario : [],
      created_at: nowIso,
      updated_at: nowIso,
    })
    changed = true
  }

  if (Array.isArray(db.usuarios)) {
    db.usuarios.forEach((user: any) => {
      const tenantId = user?.tenant_id || user?.id
      ensureConfigForTenant(tenantId, Array.isArray(user?.horario_local) ? user.horario_local : null)
      if ("telefono_whatsapp" in user) {
        delete user.telefono_whatsapp
        changed = true
      }
      if ("horario_local" in user) {
        delete user.horario_local
        changed = true
      }
    })
  }

  if (changed) {
    persistLocalDb(db as any)
  }
}

ensureConfiguracionTable()

const ensureTurnoSnapshots = () => {
  if (!Array.isArray(db.turnos)) return
  let changed = false
  db.turnos.forEach((turno: any) => {
    const finalId = turno.empleada_final_id || turno.empleada_id
    const final = db.empleadas.find((e) => e.id === finalId) || null
    if (!("empleada_final_nombre" in turno)) {
      turno.empleada_final_nombre = final?.nombre ?? null
      changed = true
    }
    if (!("empleada_final_apellido" in turno)) {
      turno.empleada_final_apellido = final?.apellido ?? null
      changed = true
    }
  })

  if (changed) {
    persistLocalDb(db as any)
  }
}

ensureTurnoSnapshots()

const ensureTurnoWorkPhotoColumns = () => {
  if (!Array.isArray(db.turnos)) return
  let changed = false
  db.turnos.forEach((turno: any) => {
    if (!("foto_trabajo_base64" in turno)) {
      turno.foto_trabajo_base64 = null
      changed = true
    }
    if (!("foto_trabajo_storage_bucket" in turno)) {
      turno.foto_trabajo_storage_bucket = null
      changed = true
    }
    if (!("foto_trabajo_storage_path" in turno)) {
      turno.foto_trabajo_storage_path = null
      changed = true
    }
    if (!("foto_trabajo_mime_type" in turno)) {
      turno.foto_trabajo_mime_type = null
      changed = true
    }
  })

  if (changed) {
    persistLocalDb(db as any)
  }
}

ensureTurnoWorkPhotoColumns()

export type TableName = keyof typeof db

export const getLocalUser = () => db.usuarios[0]

export const findUserById = (id?: string | null) => {
  if (!id) return null
  return db.usuarios.find((u) => u.id === id) || null
}

export const getTable = <T extends TableName>(name: T) => db[name]

export const generateId = () => randomUUID()

export const ensureUserId = (row: Record<string, any>) => {
  if (!("usuario_id" in row)) {
    return { ...row }
  }
  if (!row.usuario_id) {
    return { ...row, usuario_id: LOCAL_USER_ID }
  }
  return row
}

export const getDefaultUserInfo = () => ({
  id: LOCAL_USER_ID,
  username: LOCAL_USER_USERNAME,
})
