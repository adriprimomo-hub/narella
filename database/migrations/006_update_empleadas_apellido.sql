-- Migracion: reemplazar alias/color por apellido en empleadas y snapshots de turnos

ALTER TABLE empleadas
  ADD COLUMN IF NOT EXISTS apellido VARCHAR(100);

UPDATE empleadas
  SET apellido = ''
  WHERE apellido IS NULL;

ALTER TABLE empleadas
  ALTER COLUMN apellido SET NOT NULL;

ALTER TABLE empleadas
  DROP COLUMN IF EXISTS alias,
  DROP COLUMN IF EXISTS color;

ALTER TABLE turnos
  ADD COLUMN IF NOT EXISTS empleada_final_apellido VARCHAR(100);

UPDATE turnos
  SET empleada_final_apellido = ''
  WHERE empleada_final_apellido IS NULL;

ALTER TABLE turnos
  DROP COLUMN IF EXISTS empleada_final_alias;

COMMENT ON COLUMN empleadas.apellido IS 'Apellido de la empleada';
COMMENT ON COLUMN turnos.empleada_final_apellido IS 'Snapshot del apellido de la empleada final al momento del turno';
