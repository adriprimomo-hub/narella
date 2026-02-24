import "server-only"

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseServiceRoleKey)

export const createSupabaseAdminClient = () => {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase no configurado. Defini SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.")
  }

  return createClient(supabaseUrl as string, supabaseServiceRoleKey as string, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "X-Client-Info": "narella-turnos",
      },
    },
  })
}
