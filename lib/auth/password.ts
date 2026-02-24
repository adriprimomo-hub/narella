import bcrypt from "bcryptjs"

const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"]
const DEFAULT_SALT_ROUNDS = 10

const getSaltRounds = () => {
  const raw = Number.parseInt(process.env.PASSWORD_SALT_ROUNDS || "", 10)
  return Number.isFinite(raw) && raw >= 8 ? raw : DEFAULT_SALT_ROUNDS
}

export const isPasswordHashed = (value?: string | null) =>
  Boolean(value && BCRYPT_PREFIXES.some((prefix) => value.startsWith(prefix)))

export const hashPassword = async (password: string) => bcrypt.hash(password, getSaltRounds())

export const hashPasswordSync = (password: string) => bcrypt.hashSync(password, getSaltRounds())

export const maybeHashPassword = async (password: string) =>
  isPasswordHashed(password) ? password : hashPassword(password)

export const verifyPassword = async (password: string, stored: string) => {
  if (!stored) return false
  if (isPasswordHashed(stored)) {
    return bcrypt.compare(password, stored)
  }
  return password === stored
}
