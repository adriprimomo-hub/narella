import Image from "next/image"
import Link from "next/link"

export function SicaipFooter() {
  return (
    <div className="flex items-center justify-center gap-1.5 pt-4 mt-4 border-t border-border/40">
      <Link
        href="https://sicaip-arg.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
      >
        <Image
          src="/sicaip_logo.png"
          alt="SIcAIP"
          width={20}
          height={20}
          className="rounded-sm"
          unoptimized
        />
        <span>
          Sistema a medida desarrollado por <span className="font-medium">SIcAIP</span>
        </span>
      </Link>
    </div>
  )
}
