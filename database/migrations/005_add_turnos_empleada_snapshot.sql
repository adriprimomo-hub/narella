-- Migracion: agregar snapshots de empleadas en turnos
ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS empleada_final_nombre VARCHAR(100),
  ADD COLUMN IF NOT EXISTS empleada_final_apellido VARCHAR(100);

COMMENT ON COLUMN turnos.empleada_final_nombre IS 'Snapshot del nombre de la empleada final al momento del turno';
COMMENT ON COLUMN turnos.empleada_final_apellido IS 'Snapshot del apellido de la empleada final al momento del turno';
