export interface HorarioLaboral {
  dia: number
  desde: string
  hasta: string
}

export interface Empleada {
  id: string
  nombre: string
  apellido: string
  telefono?: string | null
  alias_transferencia?: string | null
  tipo_profesional_id?: string | null
  horarios?: HorarioLaboral[]
  activo: boolean
}
