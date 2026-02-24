import { Poppins, Inter } from "next/font/google"

export const font_sans = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-base",
})

export const font_mono = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-mono-base",
})
