ALTER TABLE caja_movimientos
DROP CONSTRAINT IF EXISTS caja_movimientos_monto_check;

ALTER TABLE caja_movimientos
ADD CONSTRAINT caja_movimientos_monto_check
CHECK (monto > 0 OR (monto = 0 AND source_tipo = 'arqueo'));
