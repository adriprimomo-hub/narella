"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"

export default function ErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-[var(--page-padding)] py-[var(--page-padding-lg)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Error de Autenticación</CardTitle>
          <CardDescription>Hubo un problema al iniciar sesión</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/auth/login" className="block">
            <Button className="w-full">Volver al login</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
