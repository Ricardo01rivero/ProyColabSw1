-- =====================================================================
-- UML Board - Script de creación del Supabase propio
-- Ejecutar UNA vez en: Supabase Dashboard > SQL Editor > New query > Run
-- =====================================================================

-- 1) Tabla de diagramas (nodos y aristas de ReactFlow en JSON)
CREATE TABLE IF NOT EXISTS public.diagrams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'Diagrama',
  nodes       jsonb NOT NULL DEFAULT '[]'::jsonb,
  edges       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2) Tabla de pizarras (el id lo genera la app: board_<timestamp>_<random>)
CREATE TABLE IF NOT EXISTS public.boards (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  diagram_id  uuid NOT NULL REFERENCES public.diagrams(id) ON DELETE CASCADE,
  locked      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3) Mantener updated_at al día
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS diagrams_set_updated_at ON public.diagrams;
CREATE TRIGGER diagrams_set_updated_at
  BEFORE UPDATE ON public.diagrams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Seguridad (RLS). La app no usa Supabase Auth, entra con la clave anon,
--    así que se permite acceso completo al rol anon (proyecto académico).
ALTER TABLE public.diagrams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acceso publico diagrams" ON public.diagrams;
CREATE POLICY "acceso publico diagrams" ON public.diagrams
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "acceso publico boards" ON public.boards;
CREATE POLICY "acceso publico boards" ON public.boards
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5) Tiempo real (postgres_changes) para ambas tablas
ALTER TABLE public.diagrams REPLICA IDENTITY FULL;
ALTER TABLE public.boards   REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'diagrams') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.diagrams;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime' AND tablename = 'boards') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.boards;
  END IF;
END $$;

-- 6) Storage: bucket público "imagenes" (importar diagrama desde foto)
INSERT INTO storage.buckets (id, name, public)
VALUES ('imagenes', 'imagenes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "imagenes lectura" ON storage.objects;
CREATE POLICY "imagenes lectura" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'imagenes');

DROP POLICY IF EXISTS "imagenes subida" ON storage.objects;
CREATE POLICY "imagenes subida" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'imagenes');

DROP POLICY IF EXISTS "imagenes borrado" ON storage.objects;
CREATE POLICY "imagenes borrado" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'imagenes');

-- 7) Pizarra por defecto. La app abre siempre la pizarra id '1' al entrar
--    y el enlace de invitado (/board/guest) también apunta a ella.
INSERT INTO public.diagrams (id, name)
VALUES ('550e8400-e29b-41d4-a716-446655440000', 'Diagrama Principal')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.boards (id, name, diagram_id)
VALUES ('1', 'Diagrama Principal', '550e8400-e29b-41d4-a716-446655440000')
ON CONFLICT (id) DO NOTHING;
