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
  horarios?: HorarioLaboral[]
  activo: boolean
}
