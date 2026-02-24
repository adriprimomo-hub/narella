import { describe, expect, it } from "vitest"
import { hashPassword, isPasswordHashed, verifyPassword } from "@/lib/auth/password"

describe("password helpers", () => {
  it("hashes and verifies passwords", async () => {
    const password = "super-secret"
    const hash = await hashPassword(password)
    expect(isPasswordHashed(hash)).toBe(true)
    await expect(verifyPassword(password, hash)).resolves.toBe(true)
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false)
  })

  it("accepts legacy plain-text passwords", async () => {
    await expect(verifyPassword("legacy", "legacy")).resolves.toBe(true)
    await expect(verifyPassword("legacy", "other")).resolves.toBe(false)
  })
})
