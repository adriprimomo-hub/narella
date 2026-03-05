import { NextResponse } from "next/server"

const DISABLED_RESPONSE = {
  enabled: false,
  service: "recordatorios",
  message: "Recordatorios deshabilitados. Solo se envian confirmaciones diarias.",
}

export async function GET() {
  return NextResponse.json(DISABLED_RESPONSE, { status: 410 })
}

export async function POST() {
  return NextResponse.json(DISABLED_RESPONSE, { status: 410 })
}
