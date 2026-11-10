-- =====================================================================
-- UML Board - Chat v2: mensajes privados y archivos adjuntos
-- Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > New query > Run
-- (requiere haber ejecutado antes chat.sql; también está incluido en setup.sql)
-- =====================================================================

-- Mensajes privados: si recipient tiene un nombre, solo lo ven el autor y ese destinatario.
-- NOTA: la app no usa Supabase Auth, así que la privacidad se aplica en la interfaz,
-- no en la base de datos (cualquiera con la clave anon podría consultar la tabla).
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS recipient text;

-- Archivos adjuntos (se guardan en el bucket chat-archivos)
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_url  text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachment_type text;

-- Bucket público para los archivos del chat (máx. 10 MB por archivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-archivos', 'chat-archivos', true, 10485760)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 10485760;

DROP POLICY IF EXISTS "chat archivos lectura" ON storage.objects;
CREATE POLICY "chat archivos lectura" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'chat-archivos');

DROP POLICY IF EXISTS "chat archivos subida" ON storage.objects;
CREATE POLICY "chat archivos subida" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'chat-archivos');

DROP POLICY IF EXISTS "chat archivos borrado" ON storage.objects;
CREATE POLICY "chat archivos borrado" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'chat-archivos');
