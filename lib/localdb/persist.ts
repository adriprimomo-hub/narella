import fs from "fs"
import path from "path"

const DB_FILE = process.env.LOCALDB_FILE || path.join(process.cwd(), ".localdb.json")

const isServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.AWS_REGION) ||
  Boolean(process.env.NETLIFY)

const isPersistenceEnabled = () => {
  if (process.env.LOCALDB_PERSISTENCE === "false") return false
  if (process.env.LOCALDB_ENABLE_PERSISTENCE === "true") return true
  if (process.env.NODE_ENV === "production") return false
  if (isServerless) return false
  return true
}

export const hydrateLocalDb = (db: Record<string, unknown>) => {
  try {
    if (!isPersistenceEnabled()) return
    if (!fs.existsSync(DB_FILE)) return
    const raw = fs.readFileSync(DB_FILE, "utf8")
    if (!raw.trim()) return
    const data = JSON.parse(raw)
    if (data && typeof data === "object") {
      Object.assign(db, data)
    }
  } catch (error) {
    console.warn("[localdb] No se pudo cargar", error)
  }
}

export const persistLocalDb = (db: Record<string, unknown>) => {
  try {
    if (!isPersistenceEnabled()) return
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8")
  } catch (error) {
    console.warn("[localdb] No se pudo guardar", error)
  }
}
