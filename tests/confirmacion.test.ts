import { describe, expect, it } from "vitest"
import { extractConfirmationToken } from "@/lib/confirmacion"

describe("confirmacion token extraction", () => {
  it("extracts token from URL path", () => {
    const token = "123e4567-e89b-12d3-a456-426614174000"
    const url = new URL(`https://example.com/confirmacion/${token}`)
    const result = extractConfirmationToken(undefined, url)
    expect(result.token).toBe(token)
  })

  it("handles encoded tokens", () => {
    const token = "123e4567-e89b-12d3-a456-426614174000"
    const url = new URL(`https://example.com/confirmacion/%7B${token}%7D`)
    const result = extractConfirmationToken(undefined, url)
    expect(result.token).toBe(token)
  })
})
