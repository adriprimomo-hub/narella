import fs from "fs"
import fsp from "fs/promises"
import path from "path"
import { spawn, spawnSync } from "child_process"

const ROOT = process.cwd()
const TMP_DIR = path.join(ROOT, "tmp", "qa")
const LOCALDB_PATH = path.join(ROOT, ".localdb.json")
const BACKUP_PATH = path.join(TMP_DIR, `.localdb.backup.${Date.now()}.json`)
const RESULTS_PATH = path.join(TMP_DIR, "full-system-qa-results.json")
const REPORT_PATH = path.join(TMP_DIR, "full-system-qa-report.md")
const SERVER_LOG_PATH = path.join(TMP_DIR, "full-system-qa-server.log")
const PORT = Number(process.env.QA_PORT || 3100)
const BASE_URL = `http://127.0.0.1:${PORT}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const clip = (value, max = 400) => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "")
  if (!text) return ""
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

const formatYmd = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const nextWeekdayAt = (hour, minute = 0) => {
  const now = new Date()
  for (let i = 1; i <= 21; i += 1) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + i)
    const day = candidate.getDay()
    if (day >= 1 && day <= 5) {
      candidate.setHours(hour, minute, 0, 0)
      return candidate
    }
  }
  const fallback = new Date(now)
  fallback.setDate(now.getDate() + 1)
  fallback.setHours(hour, minute, 0, 0)
  return fallback
}

const parseJsonSafe = (text) => {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

class HttpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
    this.cookies = new Map()
  }

  _cookieHeader() {
    if (!this.cookies.size) return ""
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ")
  }

  _storeCookies(headers) {
    const setCookies =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : headers.get("set-cookie")
          ? [headers.get("set-cookie")]
          : []

    for (const entry of setCookies) {
      if (!entry) continue
      const first = String(entry).split(";")[0]
      const eq = first.indexOf("=")
      if (eq < 1) continue
      const key = first.slice(0, eq).trim()
      const value = first.slice(eq + 1).trim()
      this.cookies.set(key, value)
    }
  }

  async request(method, route, options = {}) {
    const url = `${this.baseUrl}${route}`
    const headers = { ...(options.headers || {}) }
    const cookieHeader = this._cookieHeader()
    if (cookieHeader) headers.cookie = cookieHeader

    let body = undefined
    if (options.body !== undefined) {
      body = JSON.stringify(options.body)
      headers["content-type"] = "application/json"
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    })
    this._storeCookies(response.headers)
    const text = await response.text()
    const json = parseJsonSafe(text)
    return {
      status: response.status,
      ok: response.ok,
      text,
      json,
    }
  }
}

const startServer = async () => {
  await fsp.mkdir(TMP_DIR, { recursive: true })
  const logStream = fs.createWriteStream(SERVER_LOG_PATH, { flags: "w" })
  const safeEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key && !key.startsWith("=")),
  )
  const env = {
    ...safeEnv,
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    AFIP_ACCESS_TOKEN: "",
    ARCA_ACCESS_TOKEN: "",
    AFIP_FACTURACION_ACTIVA: "true",
    ARCA_FACTURACION_ACTIVA: "true",
  }
  const command = `npm run dev -- --hostname 127.0.0.1 --port ${PORT}`
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", command], {
        cwd: ROOT,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn("npm", ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(PORT)], {
        cwd: ROOT,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      })
  child.stdout.on("data", (chunk) => logStream.write(chunk))
  child.stderr.on("data", (chunk) => logStream.write(chunk))
  return { child, logStream }
}

const waitForServer = async (timeoutMs = 180000) => {
  const start = Date.now()
  let lastError = "server did not respond"
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE_URL}/api/config`, { method: "GET" })
      if ([200, 401, 403, 500].includes(res.status)) return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(1000)
  }
  throw new Error(`Timeout waiting for server: ${lastError}`)
}

const stopServer = async (server) => {
  if (!server?.child) return
  const { child, logStream } = server
  if (process.platform === "win32" && child.pid) {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" })
    } catch {
      // best effort cleanup on Windows
    }
  }
  const exited = new Promise((resolve) => {
    child.once("exit", () => resolve())
  })
  try {
    child.kill("SIGTERM")
  } catch {
    // process may already be terminated
  }
  await Promise.race([exited, sleep(6000)])
  if (!child.killed) {
    try {
      child.kill("SIGKILL")
    } catch {
      // process may already be terminated
    }
  }
  try {
    logStream.end()
  } catch {
    // stream might already be closed
  }
}

const escapeCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")

const extractTokenFromText = (value) => {
  const match = String(value || "").match(/\/confirmar\/([a-zA-Z0-9-]+)/)
  return match?.[1] || null
}

const run = async () => {
  const startedAt = new Date()
  await fsp.mkdir(TMP_DIR, { recursive: true })

  const hadLocalDb = fs.existsSync(LOCALDB_PATH)
  if (hadLocalDb) {
    await fsp.copyFile(LOCALDB_PATH, BACKUP_PATH)
  }

  const server = await startServer()
  const results = []
  const context = {}
  let counter = 0

  const record = async (area, name, expected, fn) => {
    const id = ++counter
    const started = Date.now()
    try {
      const out = await fn()
      const pass = Boolean(out?.pass)
      results.push({
        id,
        area,
        name,
        expected,
        obtained: out?.obtained || "",
        status: pass ? "PASS" : "FAIL",
        endpoint: out?.endpoint || "",
        http_status: out?.http_status ?? null,
        response_excerpt: clip(out?.response || ""),
        duration_ms: Date.now() - started,
      })
    } catch (error) {
      results.push({
        id,
        area,
        name,
        expected,
        obtained: `Error: ${error instanceof Error ? error.message : String(error)}`,
        status: "FAIL",
        endpoint: "",
        http_status: null,
        response_excerpt: "",
        duration_ms: Date.now() - started,
      })
    }
  }

  const anon = new HttpClient(BASE_URL)
  const admin = new HttpClient(BASE_URL)
  const staff = new HttpClient(BASE_URL)

  const requireCtx = (...keys) => {
    for (const key of keys) {
      if (!context[key]) throw new Error(`Missing context: ${key}`)
    }
  }

  const baseDay = nextWeekdayAt(10, 0)
  const isoAt = (hour, minute = 0) => {
    const d = new Date(baseDay)
    d.setHours(hour, minute, 0, 0)
    return d.toISOString()
  }
  const ymd = formatYmd(baseDay)

  try {
    await waitForServer()

    await record("auth", "Acceso anonimo a turnos", "401 Unauthorized", async () => {
      const res = await anon.request("GET", "/api/turnos")
      return {
        pass: res.status === 401,
        obtained: `status ${res.status}`,
        endpoint: "GET /api/turnos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("auth", "Login admin", "200 + cookie de sesion", async () => {
      const res = await admin.request("POST", "/api/auth/login", {
        body: { username: "admin", password: "admin" },
      })
      context.admin_user_id = res.json?.user?.id || null
      return {
        pass: res.status === 200 && Boolean(context.admin_user_id),
        obtained: `status ${res.status}, user ${context.admin_user_id || "null"}`,
        endpoint: "POST /api/auth/login",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("auth", "Logout admin", "logout 200 y luego turnos 401", async () => {
      const out = await admin.request("POST", "/api/auth/logout")
      const check = await admin.request("GET", "/api/turnos")
      return {
        pass: out.status === 200 && check.status === 401,
        obtained: `logout ${out.status}, turnos ${check.status}`,
        endpoint: "POST /api/auth/logout",
        http_status: out.status,
        response: { logout: out.json || out.text, after: check.json || check.text },
      }
    })

    await record("auth", "Relogin admin", "200", async () => {
      const res = await admin.request("POST", "/api/auth/login", {
        body: { username: "admin", password: "admin" },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/auth/login",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("roles", "Crear usuario staff QA", "200 + success", async () => {
      const username = `qa_staff_${Date.now()}`
      const password = `qaStaff!${Date.now()}`
      const res = await admin.request("POST", "/api/admin/users", {
        body: { username, password, rol: "staff" },
      })
      if (res.status === 200 && res.json?.success) {
        context.staff_username = username
        context.staff_password = password
      }
      return {
        pass: res.status === 200 && Boolean(res.json?.success),
        obtained: `status ${res.status}, success ${Boolean(res.json?.success)}`,
        endpoint: "POST /api/admin/users",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("roles", "Login staff", "200", async () => {
      requireCtx("staff_username", "staff_password")
      const res = await staff.request("POST", "/api/auth/login", {
        body: { username: context.staff_username, password: context.staff_password },
      })
      return {
        pass: res.status === 200 && res.json?.user?.rol === "staff",
        obtained: `status ${res.status}, rol ${res.json?.user?.rol || "null"}`,
        endpoint: "POST /api/auth/login",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("roles", "Staff no puede crear categoria", "403 Forbidden", async () => {
      const res = await staff.request("POST", "/api/categorias", { body: { nombre: `QA_CAT_STAFF_${Date.now()}` } })
      return {
        pass: res.status === 403,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/categorias",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("roles", "Staff no puede crear turnos", "403 Forbidden", async () => {
      const res = await staff.request("POST", "/api/turnos", {
        body: {
          cliente_id: "x",
          servicio_id: "y",
          empleada_id: "z",
          fecha_inicio: isoAt(9),
          duracion_minutos: 30,
        },
      })
      return {
        pass: res.status === 403,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/turnos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("roles", "Staff puede listar turnos", "200", async () => {
      const res = await staff.request("GET", "/api/turnos")
      return {
        pass: res.status === 200 && Array.isArray(res.json),
        obtained: `status ${res.status}, items ${Array.isArray(res.json) ? res.json.length : "n/a"}`,
        endpoint: "GET /api/turnos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    const horario = [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: "09:00", hasta: "18:00" }))

    await record("maestros", "Crear empleada QA 1", "200 + id", async () => {
      const res = await admin.request("POST", "/api/empleadas", {
        body: { nombre: `QAEmp1_${Date.now()}`, apellido: "Auto", telefono: "111111", horarios: horario, activo: true },
      })
      context.emp1_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.emp1_id),
        obtained: `status ${res.status}, id ${context.emp1_id || "null"}`,
        endpoint: "POST /api/empleadas",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("maestros", "Crear empleada QA 2", "200 + id", async () => {
      const res = await admin.request("POST", "/api/empleadas", {
        body: { nombre: `QAEmp2_${Date.now()}`, apellido: "Auto", telefono: "222222", horarios: horario, activo: true },
      })
      context.emp2_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.emp2_id),
        obtained: `status ${res.status}, id ${context.emp2_id || "null"}`,
        endpoint: "POST /api/empleadas",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("maestros", "Crear cliente", "200 + id", async () => {
      const res = await admin.request("POST", "/api/clientes", {
        body: { nombre: "QA", apellido: `Cliente_${Date.now()}`, telefono: "1133333333", observaciones: "qa-e2e" },
      })
      context.cliente_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.cliente_id),
        obtained: `status ${res.status}, id ${context.cliente_id || "null"}`,
        endpoint: "POST /api/clientes",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("maestros", "Crear categoria", "200 + id", async () => {
      const res = await admin.request("POST", "/api/categorias", { body: { nombre: `QA_Categoria_${Date.now()}` } })
      context.categoria_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.categoria_id),
        obtained: `status ${res.status}, id ${context.categoria_id || "null"}`,
        endpoint: "POST /api/categorias",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("maestros", "Crear recurso (capacidad 1)", "200 + id", async () => {
      const res = await admin.request("POST", "/api/recursos", {
        body: { nombre: `QA_Recurso_${Date.now()}`, cantidad_disponible: 1 },
      })
      context.recurso_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.recurso_id),
        obtained: `status ${res.status}, id ${context.recurso_id || "null"}`,
        endpoint: "POST /api/recursos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("maestros", "Crear servicio QA con recurso", "200 + id", async () => {
      requireCtx("categoria_id", "recurso_id", "emp1_id", "emp2_id")
      const res = await admin.request("POST", "/api/servicios", {
        body: {
          nombre: `QA_Servicio_${Date.now()}`,
          duracion_minutos: 30,
          precio_lista: 1200,
          precio_descuento: 1000,
          categoria_id: context.categoria_id,
          recurso_id: context.recurso_id,
          empleadas_habilitadas: [context.emp1_id, context.emp2_id],
          comision_pct: 10,
        },
      })
      context.servicio_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.servicio_id),
        obtained: `status ${res.status}, id ${context.servicio_id || "null"}`,
        endpoint: "POST /api/servicios",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("maestros", "Crear producto", "200 + id", async () => {
      const res = await admin.request("POST", "/api/productos", {
        body: { nombre: `QA_Producto_${Date.now()}`, precio_lista: 500, precio_descuento: 450, stock_actual: 10, stock_minimo: 2, activo: true },
      })
      context.producto_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.producto_id),
        obtained: `status ${res.status}, id ${context.producto_id || "null"}`,
        endpoint: "POST /api/productos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("maestros", "Crear insumo", "200 + id", async () => {
      const res = await admin.request("POST", "/api/insumos", {
        body: { nombre: `QA_Insumo_${Date.now()}`, stock_actual: 20, stock_minimo: 3, activo: true },
      })
      context.insumo_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.insumo_id),
        obtained: `status ${res.status}, id ${context.insumo_id || "null"}`,
        endpoint: "POST /api/insumos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("turnos", "Crear turno base", "200 + id", async () => {
      requireCtx("cliente_id", "servicio_id", "emp1_id")
      const res = await admin.request("POST", "/api/turnos", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, empleada_id: context.emp1_id, fecha_inicio: isoAt(10), duracion_minutos: 30, observaciones: "qa t1" },
      })
      context.turno_a_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.turno_a_id),
        obtained: `status ${res.status}, id ${context.turno_a_id || "null"}`,
        endpoint: "POST /api/turnos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("turnos", "Rechazo por superposicion", "409", async () => {
      requireCtx("cliente_id", "servicio_id", "emp1_id")
      const res = await admin.request("POST", "/api/turnos", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, empleada_id: context.emp1_id, fecha_inicio: isoAt(10), duracion_minutos: 30 },
      })
      return {
        pass: res.status === 409,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/turnos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("turnos", "Crear segundo turno", "200 + id", async () => {
      requireCtx("cliente_id", "servicio_id", "emp2_id")
      const res = await admin.request("POST", "/api/turnos", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, empleada_id: context.emp2_id, fecha_inicio: isoAt(11), duracion_minutos: 30, observaciones: "qa t2" },
      })
      context.turno_b_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.turno_b_id),
        obtained: `status ${res.status}, id ${context.turno_b_id || "null"}`,
        endpoint: "POST /api/turnos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("recursos", "Disponibilidad detecta conflicto", "200 + conflictos > 0", async () => {
      requireCtx("servicio_id")
      const res = await admin.request("POST", "/api/recursos/disponibilidad", {
        body: {
          fecha_inicio: isoAt(10),
          turnos: [
            { servicio_id: context.servicio_id, duracion_minutos: 30 },
            { servicio_id: context.servicio_id, duracion_minutos: 30 },
          ],
        },
      })
      const conflicts = Array.isArray(res.json?.conflictos) ? res.json.conflictos.length : 0
      return {
        pass: res.status === 200 && conflicts > 0,
        obtained: `status ${res.status}, conflictos ${conflicts}`,
        endpoint: "POST /api/recursos/disponibilidad",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("recursos", "Edicion de turno bloqueada por recurso", "409 Recursos insuficientes", async () => {
      requireCtx("turno_b_id")
      const res = await admin.request("PUT", `/api/turnos/${context.turno_b_id}`, {
        body: { fecha_inicio: isoAt(10, 15), duracion_minutos: 30 },
      })
      return {
        pass: res.status === 409,
        obtained: `status ${res.status}`,
        endpoint: `PUT /api/turnos/${context.turno_b_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("simultaneos", "Grupo invalido por empleada duplicada", "409", async () => {
      requireCtx("cliente_id", "servicio_id", "emp1_id")
      const res = await admin.request("POST", "/api/turnos/grupo", {
        body: {
          cliente_id: context.cliente_id,
          fecha_inicio: isoAt(14),
          turnos: [
            { servicio_id: context.servicio_id, empleada_id: context.emp1_id, duracion_minutos: 30 },
            { servicio_id: context.servicio_id, empleada_id: context.emp1_id, duracion_minutos: 30 },
          ],
        },
      })
      return {
        pass: res.status === 409,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/turnos/grupo",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("simultaneos", "Grupo valido de turnos", "200 + grupo_id", async () => {
      requireCtx("cliente_id", "servicio_id", "emp1_id", "emp2_id")
      const res = await admin.request("POST", "/api/turnos/grupo", {
        body: {
          cliente_id: context.cliente_id,
          fecha_inicio: isoAt(14),
          turnos: [
            { servicio_id: context.servicio_id, empleada_id: context.emp1_id, duracion_minutos: 30 },
            { servicio_id: context.servicio_id, empleada_id: context.emp2_id, duracion_minutos: 30 },
          ],
        },
      })
      context.grupo_id = res.json?.grupo_id || null
      context.grupo_turno_ids = Array.isArray(res.json?.turnos) ? res.json.turnos.map((x) => x.id).filter(Boolean) : []
      return {
        pass: res.status === 200 && Boolean(context.grupo_id) && context.grupo_turno_ids.length === 2,
        obtained: `status ${res.status}, grupo ${context.grupo_id || "null"}, turnos ${context.grupo_turno_ids.length}`,
        endpoint: "POST /api/turnos/grupo",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("confirmaciones", "Crear turno para confirmacion", "200 + id", async () => {
      requireCtx("cliente_id", "servicio_id", "emp1_id")
      const res = await admin.request("POST", "/api/turnos", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, empleada_id: context.emp1_id, fecha_inicio: isoAt(15), duracion_minutos: 30 },
      })
      context.turno_confirm_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.turno_confirm_id),
        obtained: `status ${res.status}, id ${context.turno_confirm_id || "null"}`,
        endpoint: "POST /api/turnos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("confirmaciones", "Generar enlace de confirmacion WhatsApp", "200 + token", async () => {
      requireCtx("turno_confirm_id")
      const res = await admin.request("POST", `/api/turnos/${context.turno_confirm_id}/confirm-whatsapp`, { body: {} })
      const decoded = decodeURIComponent(String(res.json?.whatsappLink || ""))
      context.confirm_token = extractTokenFromText(res.json?.mensaje) || extractTokenFromText(decoded)
      return {
        pass: res.status === 200 && Boolean(context.confirm_token),
        obtained: `status ${res.status}, token ${context.confirm_token ? "ok" : "null"}`,
        endpoint: `POST /api/turnos/${context.turno_confirm_id}/confirm-whatsapp`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("confirmaciones", "Consultar token de confirmacion", "200 + estado pendiente", async () => {
      requireCtx("confirm_token")
      const res = await admin.request("GET", `/api/confirmacion/${context.confirm_token}`)
      return {
        pass: res.status === 200 && res.json?.turno?.estado === "pendiente",
        obtained: `status ${res.status}, estado ${res.json?.turno?.estado || "null"}`,
        endpoint: `GET /api/confirmacion/${context.confirm_token}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("confirmaciones", "Confirmar turno por token", "200 + confirmado", async () => {
      requireCtx("confirm_token")
      const res = await admin.request("POST", `/api/confirmacion/${context.confirm_token}`, { body: { confirmado: true } })
      return {
        pass: res.status === 200 && res.json?.estado === "confirmado",
        obtained: `status ${res.status}, estado ${res.json?.estado || "null"}`,
        endpoint: `POST /api/confirmacion/${context.confirm_token}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("confirmaciones", "Reconfirmacion bloqueada", "409", async () => {
      requireCtx("confirm_token")
      const res = await admin.request("POST", `/api/confirmacion/${context.confirm_token}`, { body: { confirmado: true } })
      return {
        pass: res.status === 409,
        obtained: `status ${res.status}`,
        endpoint: `POST /api/confirmacion/${context.confirm_token}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturacion", "Crear sena facturable", "200 + sena id", async () => {
      requireCtx("cliente_id", "servicio_id")
      const res = await admin.request("POST", "/api/senas", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, monto: 300, metodo_pago: "efectivo", facturar: true, nota: "qa sena" },
      })
      context.sena_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.sena_id),
        obtained: `status ${res.status}, sena ${context.sena_id || "null"}, factura_estado ${res.json?.factura_estado || "null"}`,
        endpoint: "POST /api/senas",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturacion", "Incrementar sena facturable", "200 + nuevo monto", async () => {
      requireCtx("sena_id")
      const res = await admin.request("PATCH", `/api/senas/${context.sena_id}`, {
        body: { incremento: 100, metodo_pago: "efectivo", facturar: true },
      })
      return {
        pass: res.status === 200 && Number(res.json?.nuevo_monto || 0) >= 400,
        obtained: `status ${res.status}, nuevo_monto ${res.json?.nuevo_monto || "null"}`,
        endpoint: `PATCH /api/senas/${context.sena_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturacion", "Crear giftcard facturable", "200 + giftcard id", async () => {
      requireCtx("cliente_id", "servicio_id")
      const res = await admin.request("POST", "/api/giftcards", {
        body: { cliente_id: context.cliente_id, servicio_ids: [context.servicio_id], valido_por_dias: 30, de_parte_de: "qa", monto_total: 1200, metodo_pago: "efectivo", facturar: true },
      })
      context.giftcard_id = res.json?.giftcard?.id || null
      return {
        pass: res.status === 200 && Boolean(context.giftcard_id),
        obtained: `status ${res.status}, giftcard ${context.giftcard_id || "null"}, factura_estado ${res.json?.factura_estado || "null"}`,
        endpoint: "POST /api/giftcards",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturacion", "Editar giftcard", "200", async () => {
      requireCtx("giftcard_id", "servicio_id")
      const res = await admin.request("PATCH", `/api/giftcards/${context.giftcard_id}`, {
        body: { de_parte_de: "qa-edit", servicio_ids: [context.servicio_id], valido_por_dias: 45 },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}`,
        endpoint: `PATCH /api/giftcards/${context.giftcard_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("pagos", "Cerrar turno individual con sena y productos", "200 + pago", async () => {
      requireCtx("cliente_id", "servicio_id", "emp1_id", "sena_id", "producto_id")
      const turno = await admin.request("POST", "/api/turnos", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, empleada_id: context.emp1_id, fecha_inicio: isoAt(16), duracion_minutos: 30 },
      })
      context.turno_pago_id = turno.json?.id || null
      const res = await admin.request("POST", "/api/pagos", {
        body: {
          turno_id: context.turno_pago_id,
          metodo_pago: "efectivo",
          monto_total: 2000,
          facturar: true,
          aplicar_sena: true,
          sena_id: context.sena_id,
          productos: [{ producto_id: context.producto_id, cantidad: 1, precio_unitario: 500 }],
          servicios_agregados: [{ servicio_id: context.servicio_id, cantidad: 1, precio_unitario: 300 }],
        },
      })
      context.pago_turno_id = res.json?.pago?.id || null
      return {
        pass: res.status === 200 && Boolean(context.pago_turno_id),
        obtained: `status ${res.status}, pago ${context.pago_turno_id || "null"}`,
        endpoint: "POST /api/pagos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("pagos", "Cerrar turno con giftcard", "200", async () => {
      requireCtx("cliente_id", "servicio_id", "emp2_id", "giftcard_id")
      const turno = await admin.request("POST", "/api/turnos", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, empleada_id: context.emp2_id, fecha_inicio: isoAt(17), duracion_minutos: 30 },
      })
      context.turno_gift_id = turno.json?.id || null
      const res = await admin.request("POST", "/api/pagos", {
        body: {
          turno_id: context.turno_gift_id,
          metodo_pago: "efectivo",
          monto_total: 1200,
          aplicar_giftcard: true,
          giftcard_id: context.giftcard_id,
          facturar: true,
        },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}, giftcard_aplicada ${res.json?.giftcard_aplicada || "null"}`,
        endpoint: "POST /api/pagos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("pagos", "Reuso de giftcard bloqueado", "400", async () => {
      requireCtx("cliente_id", "servicio_id", "emp2_id", "giftcard_id")
      const turno = await admin.request("POST", "/api/turnos", {
        body: { cliente_id: context.cliente_id, servicio_id: context.servicio_id, empleada_id: context.emp2_id, fecha_inicio: isoAt(18), duracion_minutos: 30 },
      })
      context.turno_reuse_id = turno.json?.id || null
      const res = await admin.request("POST", "/api/pagos", {
        body: {
          turno_id: context.turno_reuse_id,
          metodo_pago: "efectivo",
          monto_total: 1200,
          aplicar_giftcard: true,
          giftcard_id: context.giftcard_id,
        },
      })
      return {
        pass: res.status === 400,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/pagos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("pagos", "Cerrar grupo de turnos simultaneos", "200 + pago_grupo", async () => {
      requireCtx("grupo_id", "grupo_turno_ids")
      const res = await admin.request("POST", "/api/pagos/grupo", {
        body: {
          grupo_id: context.grupo_id,
          metodo_pago: "efectivo",
          facturar: true,
          items: context.grupo_turno_ids.map((turnoId) => ({ turno_id: turnoId, monto: 900 })),
        },
      })
      context.pago_grupo_id = res.json?.pago_grupo?.id || null
      return {
        pass: res.status === 200 && Boolean(context.pago_grupo_id),
        obtained: `status ${res.status}, pago_grupo ${context.pago_grupo_id || "null"}`,
        endpoint: "POST /api/pagos/grupo",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("pagos", "No permite cerrar grupo ya cerrado", "409", async () => {
      requireCtx("grupo_id", "grupo_turno_ids")
      const res = await admin.request("POST", "/api/pagos/grupo", {
        body: {
          grupo_id: context.grupo_id,
          metodo_pago: "efectivo",
          items: context.grupo_turno_ids.map((turnoId) => ({ turno_id: turnoId, monto: 900 })),
        },
      })
      return {
        pass: res.status === 409,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/pagos/grupo",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturas", "Listado de facturas", "200 + items", async () => {
      const res = await admin.request("GET", "/api/facturas")
      context.facturas = Array.isArray(res.json) ? res.json : []
      context.factura_id = context.facturas[0]?.id || null
      context.factura_pendiente_id = context.facturas.find((x) => x?.estado === "pendiente")?.id || null
      return {
        pass: res.status === 200 && context.facturas.length > 0,
        obtained: `status ${res.status}, facturas ${context.facturas.length}`,
        endpoint: "GET /api/facturas",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturas", "Detalle de factura", "200", async () => {
      requireCtx("factura_id")
      const res = await admin.request("GET", `/api/facturas/${context.factura_id}`)
      return {
        pass: res.status === 200 && Boolean(res.json?.id),
        obtained: `status ${res.status}, id ${res.json?.id || "null"}`,
        endpoint: `GET /api/facturas/${context.factura_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturas", "Nota de credito rechazada para factura pendiente", "409", async () => {
      requireCtx("factura_pendiente_id")
      const res = await admin.request("POST", `/api/facturas/${context.factura_pendiente_id}/nota-credito`, {
        body: { monto: 50, motivo: "qa test" },
      })
      return {
        pass: res.status === 409,
        obtained: `status ${res.status}`,
        endpoint: `POST /api/facturas/${context.factura_pendiente_id}/nota-credito`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("facturas", "Estado de reintentos protegido", "401 o 500", async () => {
      const res = await admin.request("GET", "/api/facturas/reintentos?status=1")
      return {
        pass: [401, 500].includes(res.status),
        obtained: `status ${res.status}`,
        endpoint: "GET /api/facturas/reintentos?status=1",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("inventario", "Compra de producto", "200", async () => {
      requireCtx("producto_id")
      const res = await admin.request("POST", "/api/productos/compras", {
        body: { producto_id: context.producto_id, cantidad: 3, costo_unitario: 200, nota: "qa compra" },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/productos/compras",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("inventario", "Venta de producto", "200", async () => {
      requireCtx("producto_id", "cliente_id")
      const res = await admin.request("POST", "/api/productos/ventas", {
        body: { producto_id: context.producto_id, cliente_id: context.cliente_id, cantidad: 1, precio_unitario: 550, metodo_pago: "efectivo" },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/productos/ventas",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("inventario", "Movimiento de producto facturable", "200", async () => {
      requireCtx("producto_id", "cliente_id")
      const res = await admin.request("POST", "/api/productos/movimientos", {
        body: {
          producto_id: context.producto_id,
          tipo: "venta",
          cantidad: 1,
          precio_unitario: 600,
          cliente_id: context.cliente_id,
          metodo_pago: "efectivo",
          facturar: true,
        },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/productos/movimientos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("inventario", "Staff no puede registrar compra en movimientos", "403", async () => {
      requireCtx("producto_id")
      const res = await staff.request("POST", "/api/productos/movimientos", {
        body: { producto_id: context.producto_id, tipo: "compra", cantidad: 1, costo_unitario: 100, nota: "qa staff blocked" },
      })
      return {
        pass: res.status === 403,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/productos/movimientos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("insumos", "Movimiento compra de insumo", "200", async () => {
      requireCtx("insumo_id")
      const res = await admin.request("POST", "/api/insumos/movimientos", {
        body: { insumo_id: context.insumo_id, tipo: "compra", cantidad: 5, nota: "qa compra insumo" },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/insumos/movimientos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("insumos", "Bloqueo por stock insuficiente", "400", async () => {
      requireCtx("insumo_id")
      const res = await admin.request("POST", "/api/insumos/movimientos", {
        body: { insumo_id: context.insumo_id, tipo: "entrega", cantidad: 9999, empleado_id: context.emp1_id, nota: "qa sin stock" },
      })
      return {
        pass: res.status === 400,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/insumos/movimientos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("caja-reportes", "Alta de adelanto", "200", async () => {
      requireCtx("emp1_id")
      const res = await admin.request("POST", "/api/adelantos", {
        body: { empleada_id: context.emp1_id, monto: 150, motivo: "qa adelanto" },
      })
      context.adelanto_id = res.json?.id || null
      return {
        pass: res.status === 200 && Boolean(context.adelanto_id),
        obtained: `status ${res.status}, id ${context.adelanto_id || "null"}`,
        endpoint: "POST /api/adelantos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("caja-reportes", "Movimientos de caja", "200", async () => {
      const res = await admin.request("GET", "/api/caja/movimientos")
      return {
        pass: res.status === 200 && Array.isArray(res.json),
        obtained: `status ${res.status}, items ${Array.isArray(res.json) ? res.json.length : "n/a"}`,
        endpoint: "GET /api/caja/movimientos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("caja-reportes", "Egreso manual de caja", "200", async () => {
      const res = await admin.request("POST", "/api/caja/movimientos", {
        body: { tipo: "egreso", monto: 100, medio_pago: "efectivo", motivo: "qa egreso manual" },
      })
      return {
        pass: res.status === 200,
        obtained: `status ${res.status}`,
        endpoint: "POST /api/caja/movimientos",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("caja-reportes", "Reporte de servicios", "200", async () => {
      const res = await admin.request("GET", `/api/reportes/servicios?desde=${ymd}&hasta=${ymd}`)
      return {
        pass: res.status === 200 && Boolean(res.json?.resumen),
        obtained: `status ${res.status}`,
        endpoint: "GET /api/reportes/servicios",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("caja-reportes", "Reporte de cliente", "200", async () => {
      requireCtx("cliente_id")
      const res = await admin.request("GET", `/api/reportes/clientes/${context.cliente_id}`)
      return {
        pass: res.status === 200 && Boolean(res.json?.cliente),
        obtained: `status ${res.status}`,
        endpoint: `GET /api/reportes/clientes/${context.cliente_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("liquidaciones", "Calculo de liquidacion", "200 + totales", async () => {
      requireCtx("emp1_id")
      const res = await admin.request("GET", `/api/liquidaciones?empleada_id=${context.emp1_id}&desde=${ymd}&hasta=${ymd}`)
      return {
        pass: res.status === 200 && Boolean(res.json?.totales),
        obtained: `status ${res.status}, neto ${res.json?.totales?.neto ?? "n/a"}`,
        endpoint: "GET /api/liquidaciones",
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("validaciones", "No permite borrar categoria en uso", "400", async () => {
      requireCtx("categoria_id")
      const res = await admin.request("DELETE", `/api/categorias/${context.categoria_id}`)
      return {
        pass: res.status === 400,
        obtained: `status ${res.status}`,
        endpoint: `DELETE /api/categorias/${context.categoria_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("validaciones", "No permite borrar recurso en uso", "400", async () => {
      requireCtx("recurso_id")
      const res = await admin.request("DELETE", `/api/recursos/${context.recurso_id}`)
      return {
        pass: res.status === 400,
        obtained: `status ${res.status}`,
        endpoint: `DELETE /api/recursos/${context.recurso_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })

    await record("validaciones", "No permite borrar giftcard usada", "400", async () => {
      requireCtx("giftcard_id")
      const res = await admin.request("DELETE", `/api/giftcards/${context.giftcard_id}`)
      return {
        pass: res.status === 400,
        obtained: `status ${res.status}`,
        endpoint: `DELETE /api/giftcards/${context.giftcard_id}`,
        http_status: res.status,
        response: res.json || res.text,
      }
    })
  } finally {
    await stopServer(server)
    if (hadLocalDb && fs.existsSync(BACKUP_PATH)) {
      await fsp.copyFile(BACKUP_PATH, LOCALDB_PATH)
    }
  }

  const finishedAt = new Date()
  const passed = results.filter((x) => x.status === "PASS").length
  const failed = results.length - passed

  const payload = {
    generated_at: finishedAt.toISOString(),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt.getTime() - startedAt.getTime(),
    base_url: BASE_URL,
    port: PORT,
    summary: { total: results.length, passed, failed },
    artifacts: {
      results_json: RESULTS_PATH,
      report_md: REPORT_PATH,
      server_log: SERVER_LOG_PATH,
    },
    results,
  }

  const lines = []
  lines.push("# Informe QA E2E - Sistema completo")
  lines.push("")
  lines.push(`Fecha: ${finishedAt.toISOString()}`)
  lines.push(`Base URL: ${BASE_URL}`)
  lines.push("")
  lines.push("## Resumen")
  lines.push("")
  lines.push(`- Total casos: ${results.length}`)
  lines.push(`- Pasaron: ${passed}`)
  lines.push(`- Fallaron: ${failed}`)
  lines.push("")
  lines.push("## Resultado por caso")
  lines.push("")
  lines.push("| ID | Area | Caso | Esperado | Obtenido | Estado |")
  lines.push("|---:|---|---|---|---|---|")
  for (const row of results) {
    lines.push(
      `| ${row.id} | ${escapeCell(row.area)} | ${escapeCell(row.name)} | ${escapeCell(row.expected)} | ${escapeCell(row.obtained)} | ${row.status} |`,
    )
  }

  if (failed > 0) {
    lines.push("")
    lines.push("## Fallos")
    lines.push("")
    for (const row of results.filter((x) => x.status === "FAIL")) {
      lines.push(`### Caso ${row.id} - ${row.name}`)
      lines.push(`- Area: ${row.area}`)
      lines.push(`- Esperado: ${row.expected}`)
      lines.push(`- Obtenido: ${row.obtained}`)
      if (row.endpoint) lines.push(`- Endpoint: ${row.endpoint}`)
      if (row.http_status != null) lines.push(`- HTTP status: ${row.http_status}`)
      if (row.response_excerpt) lines.push(`- Respuesta: \`${escapeCell(row.response_excerpt)}\``)
      lines.push("")
    }
  }

  await fsp.writeFile(RESULTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  await fsp.writeFile(REPORT_PATH, `${lines.join("\n")}\n`, "utf8")

  console.log(`QA run complete. Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`)
  console.log(`Results JSON: ${RESULTS_PATH}`)
  console.log(`Report MD: ${REPORT_PATH}`)
  console.log(`Server log: ${SERVER_LOG_PATH}`)
  if (failed > 0) process.exitCode = 1
}

run().catch((error) => {
  console.error("QA runner failed:", error)
  process.exitCode = 1
})
