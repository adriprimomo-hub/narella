"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState("")
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFormError("")
    setErrors({})

    try {
      const nextErrors: { username?: string; password?: string } = {}
      if (!username.trim()) nextErrors.username = "Ingresa el usuario."
      if (!password.trim()) nextErrors.password = "Ingresa la contraseña."
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors)
        return
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        setFormError(data?.error || "Credenciales inválidas")
        return
      }

      window.location.assign("/dashboard")
    } catch (err) {
      setFormError("Error al conectar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-[var(--page-padding)] py-[var(--page-padding-lg)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center">Narella Turnos</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="text"
                inputMode="text"
                placeholder="Usuario"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (errors.username) setErrors((prev) => ({ ...prev, username: undefined }))
                }}
                required
              />
              {errors.username && <p className="text-xs text-destructive mt-1">{errors.username}</p>}
            </div>
            <div>
              <Input
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }))
                }}
                required
              />
              {errors.password && <p className="text-xs text-destructive mt-1">{errors.password}</p>}
            </div>
            {formError && <p className="text-destructive text-sm">{formError}</p>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Conectando..." : "Iniciar sesión"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
