"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { LogOutIcon, SettingsIcon } from "lucide-react"

export function Navbar() {
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", cache: "no-store" })
    } finally {
      window.location.assign("/auth/login")
    }
  }

  return (
    <nav className="border-b bg-card">
      <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-between px-[var(--page-padding-lg)] py-4">
        <Link href="/dashboard" className="text-xl font-bold text-primary">
          Narella Turnos
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="rounded-full" aria-label="Abrir menú de opciones">
              <SettingsIcon className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Opciones</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2">
              <Link href="/dashboard/config" className="flex items-center gap-2" prefetch={false}>
                <SettingsIcon className="h-4 w-4" />
                Configuración
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onSelect={handleLogout}>
              <LogOutIcon className="h-4 w-4" />
              Salir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  )
}
