import type { Metadata } from "next"
import Script from "next/script";
import type { ReactNode } from "react"
import "./globals.css"
import { font_mono, font_sans } from "./fonts"
import { ThemeProvider } from "@/components/theme-provider"
import { SystemDialogsHost } from "@/components/ui/system-dialogs-host"
import { Toaster } from "@/components/ui/toaster"

export const metadata: Metadata = {
  title: "Narella Turnos",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
        {process.env.NODE_ENV === "development" && (
          <Script
            src="//unpkg.com/@react-grab/mcp/dist/client.global.js"
            strategy="lazyOnload"
          />
        )}
      </head>
      <body className={`${font_sans.variable} ${font_mono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <SystemDialogsHost />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}

