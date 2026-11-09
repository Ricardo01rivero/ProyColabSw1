-- Agregar campo locked a la tabla boards
ALTER TABLE boards 
ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

-- Actualizar boards existentes
UPDATE boards SET locked = FALSE WHERE locked IS NULL;
