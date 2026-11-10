-- =====================================================================
-- UML Board - Chat compartido con la IA "desarrollador senior" (2do parcial)
-- Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > New query > Run
-- (también está incluido al final de setup.sql)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id         text NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  author           text NOT NULL,                 -- nombre de quien escribe ('IA' para la IA)
  role             text NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text NOT NULL,
  reply_to_author  text,                          -- a quién responde la IA
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_board_created_idx
  ON public.chat_messages (board_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acceso publico chat" ON public.chat_messages;
CREATE POLICY "acceso publico chat" ON public.chat_messages
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Tiempo real: todos los usuarios de la pizarra ven los mensajes al instante
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
END $$;
